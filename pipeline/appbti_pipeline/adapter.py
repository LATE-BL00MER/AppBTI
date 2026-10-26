"""코드북으로 CSV/XLSX 원본을 표준 필드에 연결한다."""

from pathlib import Path

import pandas as pd
import yaml

REQUIRED = {"month", "age_group", "major", "minor_name", "uu", "avg_days", "status"}


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


def read_source(folder: Path, codebook: dict) -> pd.DataFrame:
    files = sorted(p for p in folder.iterdir() if p.suffix.lower() in {".csv", ".xlsx"} and not p.name.startswith("~$"))
    if not files:
        raise ValueError("입력 폴더에 CSV/XLSX 원본이 없습니다. 원본 버전별 폴더를 지정하세요.")
    frames = []
    for path in files:
        frame = pd.read_csv(path, encoding="utf-8-sig", dtype=str) if path.suffix.lower() == ".csv" else pd.read_excel(path, dtype=str)
        frame = frame.rename(columns=codebook["columns"])
        missing = REQUIRED - set(frame.columns)
        if missing:
            raise ValueError(f"{path.name}: 필수 컬럼 누락 {sorted(missing)}")
        for column in frame.columns:
            frame[column] = frame[column].str.strip()
        if "minor_code" not in frame:
            frame["minor_code"] = None
        lookup = {c["name"]: c["code"] for c in codebook["minor_categories"]}
        frame["minor_code"] = frame["minor_code"].where(frame["minor_code"].notna() & frame["minor_code"].ne(""), frame["minor_name"].map(lookup))
        for optional in ("avg_daily_time", "time_unit", "note"):
            if optional not in frame:
                frame[optional] = None
        frame["status"] = frame["status"].map(codebook["statuses"])
        frames.append(frame)
    return pd.concat(frames, ignore_index=True)
