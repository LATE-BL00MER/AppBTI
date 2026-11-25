"""분야별 패턴 화면에 쓸 월별 근거와 연령대별 비교를 만든다."""

from math import ceil

import pandas as pd

from .composition_index import composition_indices, reference_category
from .group_profiles import build_group_profiles
from .relative_patterns import STABLE_HIGH, STABLE_LOW
from .representative import is_other, major_codes, representative_codes
from .service_evidence import build_service_evidence


def representative_categories(categories, months, ages, profiles):
    index = pd.MultiIndex.from_product([months, ages], names=["month", "age_group"])
    columns = {}
    for category in categories:
        code = category["code"]
        rows = [profiles.get((code, age, month)) for month, age in index]
        if all(row and row["status"] == "normal" for row in rows) and len({row["segment"] for row in rows}) == 1:
            columns[code] = [row["uu"] for row in rows]
    users = pd.DataFrame(columns, index=index, dtype=float)
    eligible = representative_codes(users, len(ages), len(months))[0]
    major = major_codes(users, len(ages), len(months))
    keep = lambda codes: {category["code"] for category in categories if category["code"] in codes and not is_other(category["name"])}
    return keep(eligible), keep(major & eligible)


def build_findings(dataset, codebook):
    meta = dataset["meta"]
    months = meta["months"]
    minimum = ceil(len(months) * 2 / 3)
    output = {
        "isMock": meta["isMock"],
        "months": months,
        "minimumMonths": minimum,
        "categoryCount": len(meta["minorCategories"]),
        "representativeCodes": [],
        "majorCodes": [],
        "groupProfiles": None,
        "serviceEvidence": [],
        "comparisonVersion": 3,
        "evidenceThresholds": {"above": STABLE_HIGH, "below": STABLE_LOW},
        "compositionIndexReference": None,
    }
    if len(months) < 2:
        return output

    ages = [group["id"] for group in meta["ageGroups"]]
    profiles = {(row["minorCode"], row["ageGroup"], row["month"]): row for row in dataset["profiles"]}
    reference = reference_category({
        "minor_categories": meta["minorCategories"], "composition_index": codebook.get("composition_index", {}),
    })
    output["compositionIndexReference"] = reference
    indices = composition_indices(
        {(row["month"], row["ageGroup"], row["minorCode"]): row["ageShare"] for row in dataset["profiles"]},
        reference["minorCode"],
    ) if reference else {}
    eligible, major = representative_categories(meta["minorCategories"], months, ages, profiles)
    output["representativeCodes"] = sorted(eligible)
    output["majorCodes"] = sorted(major)
    output["groupProfiles"] = build_group_profiles(meta, profiles, eligible)
    output["serviceEvidence"] = build_service_evidence(meta, profiles, indices)
    return output


