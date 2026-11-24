"""같은 달·연령대의 기준 카테고리 구성비로 보정한 상대 지수."""

from math import isfinite


def reference_category(codebook):
    code = codebook.get("composition_index", {}).get("reference_minor_code")
    return next(
        ({"minorCode": code, "name": item["name"]} for item in codebook["minor_categories"] if item["code"] == code),
        None,
    )


def composition_indices(shares, reference_code):
    indices = {}
    for (month, age, code), share in shares.items():
        denominator = shares.get((month, age, reference_code))
        valid = (share is not None and isfinite(share) and share >= 0 and
                 denominator is not None and isfinite(denominator) and denominator > 0)
        indices[month, age, code] = share / denominator if valid else None
    return indices
