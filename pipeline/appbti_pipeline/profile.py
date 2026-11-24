"""집단 지표는 여기서만 계산한다. Spring과 React는 산출물만 읽는다."""

from itertools import product

import pandas as pd

from .adapter import TIME_UNIT_TO_MINUTES
from .composition_index import composition_indices, reference_category
from .reference import build_monthly_signals, build_survey_reference
from .relative_patterns import center_by_age, joint_clr, multiplier_lookup
from .representative import representative_codes


def build_profiles(frame: pd.DataFrame, codebook: dict, report: dict) -> dict:
    frame = frame.copy()
    for field in ("uu", "avg_days", "avg_daily_time"):
        frame[field] = pd.to_numeric(frame[field], errors="coerce")
        frame.loc[frame["status"] != "normal", field] = float("nan")
    metrics = codebook["metrics"]
    time = metrics["daily_time"]
    time_enabled = bool(time["enabled"] and time.get("definition") and time.get("denominator") and time.get("source_unit") in TIME_UNIT_TO_MINUTES)
    frame["avg_daily_time"] = frame["avg_daily_time"] * frame["time_unit"].map(TIME_UNIT_TO_MINUTES) if time_enabled else float("nan")
    time_available = bool(frame["avg_daily_time"].notna().any())
    months = [str(m) for m in pd.period_range(codebook["period"]["start"], codebook["period"]["end"], freq="M")]
    ages = codebook["age_groups"]
    provided = set(frame["minor_code"])
    minors = [c for c in codebook["minor_categories"] if c["code"] in provided]
    rows = frame.set_index(["month", "age_group", "minor_code"])
    output = []
    shares = {}
    index = pd.MultiIndex.from_product([months, [age["id"] for age in ages]], names=["month", "age_group"])
    boundaries = codebook["continuity_breaks"]
    crosses_break = any(months[0] < boundary <= months[-1] for boundary in boundaries)
    eligible = set() if crosses_break else representative_codes(rows["uu"].unstack().reindex(index), len(ages), len(months))[0]
    days_multipliers, time_multipliers = {}, {}
    if time_available:
        days_table = rows["avg_days"].unstack().reindex(index)
        time_table = rows["avg_daily_time"].unstack().reindex(index)
        segments = pd.Series([sum(boundary <= month for boundary in codebook["continuity_breaks"])
                              for month, _ in index], index=index)
        for _, segment in segments.groupby(segments):
            centered = center_by_age(joint_clr(days_table.loc[segment.index], time_table.loc[segment.index]))
            days_multipliers.update(multiplier_lookup(centered, "days"))
            time_multipliers.update(multiplier_lookup(centered, "time"))

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
            share = uu / denominator if uu is not None and denominator is not None and denominator > 0 else None
            shares[month, age["id"], category["code"]] = share
            output.append({"month": month, "ageGroup": age["id"], "minorCode": category["code"],
                           "status": row["status"] if row is not None else "missing",
                           "uu": uu, "avgDays": days,
                           "ageShare": round(share, 6) if share is not None else None,
                           "referenceDays": number(reference),
                           "relativeFrequency": round(days / reference, 6) if days is not None and reference is not None and reference > 0 else None,
                           "avgDailyTime": number(row["avg_daily_time"]) if row is not None else None,
                           "ageRelativeDays": number(days_multipliers.get(key)),
                           "ageRelativeTime": number(time_multipliers.get(key)),
                           "representativeEligible": category["code"] in eligible,
                           "segment": sum(1 for boundary in codebook["continuity_breaks"] if boundary <= month)})
    composition_reference = reference_category(codebook)
    if composition_reference:
        indices = composition_indices(shares, composition_reference["minorCode"])
        for row in output:
            value = indices[row["month"], row["ageGroup"], row["minorCode"]]
            row["ageShareIndex"] = round(value, 6) if value is not None else None
    result = {"meta": {"schemaVersion": 1, "isMock": bool(codebook.get("is_mock", False)),
                     "source": codebook.get("source", "LG U+ 제공 기준 연령대·기간 집계"),
                     "months": months, "ageGroups": ages, "minorCategories": minors,
                     "majorCategories": codebook["major_categories"],
                     "metrics": {"dailyTime": time_available, "timeComparable": bool(time_available and time.get("survey_definition_matches")),
                                 "weightedReference": metrics["weighted_reference_days_enabled"] and metrics["avg_days_denominator"] == "users"},
                     "avgDaysDenominator": metrics["avg_days_denominator"],
                     "continuityBreaks": codebook["continuity_breaks"],
                     "compositionIndexReference": composition_reference,
                     "quality": {"rowCount": report["rowCount"], "warningCount": len(report["warnings"])}},
            "profiles": output}
    result["surveyReference"] = build_survey_reference(output, result["meta"], time.get("day_basis", "used_days"))
    signals = build_monthly_signals(output, result["meta"], codebook.get("monthly_signals"))
    if signals is not None:
        result["monthlySignals"] = signals
    return result
