"""오류와 경고를 수집한다. 결측은 숫자 0으로 바꾸지 않는다."""

import calendar
import math
import re

import pandas as pd


def validate(frame: pd.DataFrame, codebook: dict) -> dict:
    errors, warnings = [], []
    ages = {a["id"] for a in codebook["age_groups"]}
    minors = {c["code"]: c for c in codebook["minor_categories"]}
    if len(ages) != 6 or not minors:
        errors.append("코드북에 제공 기준 6개 집단과 중분류 정의가 필요합니다.")
    if frame.duplicated(["month", "age_group", "minor_code"]).any():
        errors.append("월×연령집단×중분류 중복 행이 있습니다.")
    for index, row in frame.iterrows():
        prefix = f"{index + 2}행"
        month = row["month"]
        valid_month = isinstance(month, str) and re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month)
        if not valid_month:
            errors.append(f"{prefix}: 기준월 형식 오류")
        elif not codebook["period"]["start"] <= month <= codebook["period"]["end"]:
            errors.append(f"{prefix}: 요청 기간 밖의 기준월")
        if row["age_group"] not in ages:
            errors.append(f"{prefix}: 코드북에 없는 연령집단")
        minor = minors.get(row["minor_code"])
        if minor is None or row["minor_name"] != minor["name"] or row["major"] != minor["major"]:
            errors.append(f"{prefix}: 중분류 코드·명칭·대분류가 코드북과 다릅니다.")
        if pd.isna(row["status"]):
            errors.append(f"{prefix}: 알 수 없는 데이터 상태")
        for field in ("uu", "avg_days", "avg_daily_time"):
            raw = row[field]
            if pd.isna(raw) or raw == "":
                continue
            try:
                value = float(raw)
                if not math.isfinite(value) or value < 0:
                    raise ValueError()
                if field == "uu" and not value.is_integer():
                    raise ValueError()
                if field == "avg_days" and valid_month and value > calendar.monthrange(int(month[:4]), int(month[5:]))[1]:
                    raise ValueError()
            except (ValueError, TypeError):
                errors.append(f"{prefix}: {field} 숫자 범위 오류")
        if pd.notna(row["avg_daily_time"]) and row["avg_daily_time"] != "":
            if pd.isna(row["time_unit"]) or row["time_unit"] not in {"초", "분", "시간", "seconds", "minutes", "hours"}:
                warnings.append(f"{prefix}: 시간 단위 누락·미지원으로 시간 지표 제외")
    if frame["status"].isin(["missing", "suppressed"]).any():
        warnings.append("비공개·결측 행의 수치는 null로 처리합니다.")
    expected = len(pd.period_range(codebook["period"]["start"], codebook["period"]["end"], freq="M")) * len(ages) * len(minors)
    if len(frame) < expected:
        warnings.append(f"기대 행 {expected}개 중 {expected - len(frame)}개 부족. 누락 조합은 null로 출력합니다.")
    return {"valid": not errors, "errors": errors, "warnings": warnings, "rowCount": len(frame)}
