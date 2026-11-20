"""코드북으로 CSV/XLSX 원본을 표준 필드에 연결한다."""

from pathlib import Path

import pandas as pd
import yaml

REQUIRED = {"month", "age_group", "major", "minor_name", "uu", "avg_days"}


def load_codebook(path: Path) -> dict:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if "extends" not in data:
        return data
    base = load_codebook(path.parent / data.pop("extends"))

    def merge(target, source):
        for key, value in source.items():
            if isinstance(value, dict) and isinstance(target.get(key), dict):
                merge(target[key], value)
            else:
                target[key] = value
        return target

    return merge(base, data)


def derive_status(frame: pd.DataFrame) -> pd.Series:
    """상태 컬럼이 없는 원본의 상태를 값으로 정한다. 수치는 0으로 채우지 않는다."""
    uu = pd.to_numeric(frame["uu"], errors="coerce")
    days = pd.to_numeric(frame["avg_days"], errors="coerce")
    status = pd.Series("normal", index=frame.index)
    # TODO(확인 필요): UU 0의 의미(소수 이용자 비공개 여부). 확정 전에도 0으로 채우지 않고 비공개로 둔다.
    status[uu.eq(0)] = "suppressed"
    status[uu.isna() | days.isna()] = "missing"
    return status


def summarize_excluded(dropped: pd.DataFrame, codebook: dict) -> list[dict]:
    """제외한 중분류의 행 수, 품질 사유, 빠진 월×연령대 조합을 리포트용으로 요약한다."""
    months = [str(m) for m in pd.period_range(codebook["period"]["start"], codebook["period"]["end"], freq="M")]
    summary = []
    for name, group in dropped.groupby("minor_name", sort=True):
        present = set(zip(group["month"], group["age_group"]))
        summary.append({"minorName": name, "rows": len(group),
                        "uuZeroRows": int(pd.to_numeric(group["uu"], errors="coerce").eq(0).sum()),
                        "blankRows": int((group["uu"].isna() | group["avg_days"].isna()).sum()),
                        "missingCombos": [{"month": month, "ageGroup": age["id"]} for month in months for age in codebook["age_groups"]
                                          if (month, age["id"]) not in present]})
    return summary


def read_source(folder: Path, codebook: dict) -> pd.DataFrame:
    files = sorted(p for p in folder.iterdir() if p.suffix.lower() in {".csv", ".xlsx"} and not p.name.startswith("~$"))
    if not files:
        raise ValueError("입력 폴더에 CSV/XLSX 원본이 없습니다. 원본 버전별 폴더를 지정하세요.")
    frames, dropped = [], []
    age_ids = {a["label"]: a["id"] for a in codebook["age_groups"]}
    for path in files:
        frame = pd.read_csv(path, encoding="utf-8-sig", dtype=str) if path.suffix.lower() == ".csv" else pd.read_excel(path, dtype=str)
        frame = frame.rename(columns=codebook["columns"])
        missing = REQUIRED - set(frame.columns)
        if missing:
            raise ValueError(f"{path.name}: 필수 컬럼 누락 {sorted(missing)}")
        for column in frame.columns:
            frame[column] = frame[column].str.strip()
        # 원본의 YYYYMM과 연령대 라벨을 내부 형식으로 맞춘다.
        frame["month"] = frame["month"].str.replace(r"^(\d{4})(\d{2})$", r"\1-\2", regex=True)
        frame["age_group"] = frame["age_group"].replace(age_ids)
        excluded = frame["minor_name"].isin(codebook.get("exclude_minor_names", []))
        dropped.append(frame[excluded])
        frame = frame[~excluded].copy()
        if "minor_code" not in frame:
            frame["minor_code"] = None
        lookup = {c["name"]: c["code"] for c in codebook["minor_categories"]}
        frame["minor_code"] = frame["minor_code"].where(frame["minor_code"].notna() & frame["minor_code"].ne(""), frame["minor_name"].map(lookup))
        for optional in ("avg_daily_time", "time_unit", "note"):
            if optional not in frame:
                frame[optional] = None
        # 원본에 단위 열이 없으면 코드북이 선언한 단위로 읽는다. 선언이 없으면 비워 두고 시간 지표에서 제외한다.
        time = codebook.get("metrics", {}).get("daily_time", {})
        if time.get("enabled") and time.get("source_unit"):
            blank_unit = frame["time_unit"].isna() | frame["time_unit"].eq("")
            has_time = frame["avg_daily_time"].notna() & frame["avg_daily_time"].ne("")
            frame.loc[blank_unit & has_time, "time_unit"] = time["source_unit"]
        frame["status"] = frame["status"].map(codebook["statuses"]) if "status" in frame else derive_status(frame)
        frames.append(frame)
    result = pd.concat(frames, ignore_index=True)
    result.attrs["excluded"] = summarize_excluded(pd.concat(dropped, ignore_index=True), codebook)
    return result
