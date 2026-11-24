"""미리보기의 월별 기준 배수를 공통 파이프라인 산식으로 계산한다."""

from math import isfinite
from statistics import geometric_mean, median

import pandas as pd

from .relative_patterns import STABLE_HIGH, STABLE_LOW, center_by_age, joint_clr, multiplier_lookup


def build_service_evidence(meta, profiles, indices):
    months = meta["months"]
    ages = [group["id"] for group in meta["ageGroups"]]
    if len(ages) != 6 or not months:
        return []
    codes = []
    for category in meta["minorCategories"]:
        code = category["code"]
        rows = [profiles.get((code, age, month)) for month in months for age in ages]
        if all(rows) and len({row["segment"] for row in rows}) == 1:
            codes.append(code)
    index = pd.MultiIndex.from_product([months, ages], names=["month", "age_group"])

    def table(field):
        return pd.DataFrame({
            code: [profiles[(code, age, month)][field]
                   if profiles[(code, age, month)]["status"] == "normal" else None
                   for month, age in index]
            for code in codes
        }, index=index, dtype=float)

    centered = center_by_age(joint_clr(table("avgDays"), table("avgDailyTime")))
    output = []
    for metric, reference, values, summarize in (
        ("avgDays", "clrAgeMean", multiplier_lookup(centered, "days"), geometric_mean),
        ("ageShare", "compositionIndex", indices, median),
        ("avgDailyTime", "clrAgeMean", multiplier_lookup(centered, "time"), geometric_mean),
    ):
        services = []
        for code in codes:
            points = [{"month": month, "values": {age: values.get((month, age, code)) for age in ages}} for month in months]
            if any(value is None or not isfinite(value) for point in points for value in point["values"].values()):
                continue
            combined = {age: summarize(point["values"][age] for point in points) for age in ages}
            age_summary = {}
            for age, period_value in combined.items():
                signals = []
                for point in points:
                    value = point["values"][age]
                    qualifies = (period_value > 1 and value > STABLE_HIGH) or (period_value < 1 and value < STABLE_LOW)
                    signals.append({"month": point["month"], "value": value, "baseline": 1, "qualified": qualifies})
                age_summary[age] = {"baseline": 1, "gap": period_value - 1, "signals": signals,
                                    "matchedMonths": sum(signal["qualified"] for signal in signals)}
            service = {"minorCode": code, "values": combined, "points": points, "ages": age_summary}
            if metric == "ageShare":
                service["rawShares"] = {age: profiles[(code, age, months[-1])]["ageShare"] for age in ages}
            services.append(service)
        if services:
            output.append({"metric": metric, "reference": reference, "services": services})
    return output
