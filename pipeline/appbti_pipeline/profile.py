"""집단 지표는 여기서만 계산한다. Spring과 React는 산출물만 읽는다."""

from itertools import product

import pandas as pd


def build_profiles(frame: pd.DataFrame, codebook: dict, report: dict) -> dict:
    frame = frame.copy()
    for field in ("uu", "avg_days", "avg_daily_time"):
        frame[field] = pd.to_numeric(frame[field], errors="coerce")
        frame.loc[frame["status"] != "normal", field] = float("nan")
    metrics = codebook["metrics"]
    time = metrics["daily_time"]
    units = {"초": 1 / 60, "분": 1, "시간": 60, "seconds": 1 / 60, "minutes": 1, "hours": 60}
    time_enabled = bool(time["enabled"] and time.get("definition") and time.get("denominator") and time.get("source_unit"))
    frame["avg_daily_time"] = frame["avg_daily_time"] * frame["time_unit"].map(units) if time_enabled else float("nan")
    time_available = bool(frame["avg_daily_time"].notna().any())
    months = [str(m) for m in pd.period_range(codebook["period"]["start"], codebook["period"]["end"], freq="M")]
    ages = codebook["age_groups"]
    provided = set(frame["minor_code"])
    minors = [c for c in codebook["minor_categories"] if c["code"] in provided]
    rows = frame.set_index(["month", "age_group", "minor_code"])
    output = []

    def number(value):
        return None if pd.isna(value) else round(float(value), 6)

    for month, category in product(months, minors):
        group = frame[(frame["month"] == month) & (frame["minor_code"] == category["code"])].set_index("age_group").reindex([a["id"] for a in ages])
        complete_uu = bool(group["uu"].notna().all())
        denominator = float(group["uu"].sum()) if complete_uu else None
        complete_days = bool(group["avg_days"].notna().all())
        reference = None
        # TODO(확인 필요): 실제 평균 이용일수 분모. 플래그 off일 때 단순 평균으로 대체하지 않는다.
        if metrics["weighted_reference_days_enabled"] and metrics["avg_days_denominator"] == "users" and complete_days and denominator is not None and denominator > 0:
            reference = float((group["avg_days"] * group["uu"]).sum() / denominator)
        for age in ages:
            key = (month, age["id"], category["code"])
            row = rows.loc[key] if key in rows.index else None
            days = number(row["avg_days"]) if row is not None else None
            uu = number(row["uu"]) if row is not None else None
            output.append({"month": month, "ageGroup": age["id"], "minorCode": category["code"],
                           "status": row["status"] if row is not None else "missing",
                           "uu": uu, "avgDays": days,
                           "ageShare": round(uu / denominator, 6) if uu is not None and denominator is not None and denominator > 0 else None,
                           "referenceDays": number(reference),
                           "relativeFrequency": round(days / reference, 6) if days is not None and reference is not None and reference > 0 else None,
                           "avgDailyTime": number(row["avg_daily_time"]) if row is not None else None,
                           "segment": sum(1 for boundary in codebook["continuity_breaks"] if boundary <= month)})
    return {"meta": {"schemaVersion": 1, "isMock": bool(codebook.get("is_mock", False)),
                     "source": codebook.get("source", "LG U+ 제공 기준 연령대·기간 집계"),
                     "months": months, "ageGroups": ages, "minorCategories": minors,
                     "majorCategories": codebook["major_categories"],
                     "metrics": {"dailyTime": time_available, "timeComparable": bool(time_available and time.get("survey_definition_matches")),
                                 "weightedReference": metrics["weighted_reference_days_enabled"] and metrics["avg_days_denominator"] == "users"},
                     "avgDaysDenominator": metrics["avg_days_denominator"],
                     "continuityBreaks": codebook["continuity_breaks"],
                     "quality": {"rowCount": report["rowCount"], "warningCount": len(report["warnings"])}},
            "profiles": output}
