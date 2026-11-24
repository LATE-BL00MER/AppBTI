"""NaN을 허용하지 않고 JSON 파일을 교체해 불완전한 결과가 남지 않게 한다."""

import json
from pathlib import Path

import pandas as pd

CLEAN_COLUMNS = ["month", "age_group", "age_label", "major", "minor_code", "minor_name",
                 "uu", "avg_days", "avg_daily_time", "time_unit", "status"]


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")
    temporary.replace(path)


def write_csv(path: Path, frame: pd.DataFrame) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    # Excel에서 한글이 깨지지 않도록 BOM을 붙인다. 빈 값은 빈 칸 그대로 둔다.
    frame.to_csv(temporary, index=False, encoding="utf-8-sig")
    temporary.replace(path)


def clean_table(frame: pd.DataFrame, codebook: dict) -> pd.DataFrame:
    """표준 컬럼명의 정제 표를 월·연령대·중분류 순으로 만든다."""
    age_rank = {a["id"]: i for i, a in enumerate(codebook["age_groups"])}
    minor_rank = {c["code"]: i for i, c in enumerate(codebook["minor_categories"])}
    labels = {a["id"]: a["label"] for a in codebook["age_groups"]}
    table = frame.assign(age_label=frame["age_group"].map(labels), _age=frame["age_group"].map(age_rank), _minor=frame["minor_code"].map(minor_rank))
    return table.sort_values(["month", "_age", "_minor"])[CLEAN_COLUMNS]


def minor_code_table(codebook: dict) -> pd.DataFrame:
    excluded = set(codebook.get("exclude_minor_names", []))
    return pd.DataFrame([{"code": c["code"], "name": c["name"], "major": c["major"], "excluded": c["name"] in excluded}
                         for c in codebook["minor_categories"]])
