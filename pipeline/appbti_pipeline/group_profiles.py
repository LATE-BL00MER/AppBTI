"""월별 집단 이용 기록의 CLR 패턴과 월 제외 검증을 계산한다."""

from calendar import monthrange
from math import isclose, isfinite, log, sqrt
from statistics import fmean

from .relative_patterns import NEAR_TIE, distance_gap_ratio


def _log_values(rows, months, metric):
    return tuple(
        log(row[metric] / monthrange(int(month[:4]), int(month[5:]))[1] if metric == "avgDays" else row[metric])
        for month, row in zip(months, rows)
    )


def _clr(values):
    center = fmean(values)
    return tuple(value - center for value in values)


def _usable(row, metric):
    return row and row[metric] is not None and isfinite(row[metric]) and row[metric] > 0


def _clr_block(meta, profiles, metric, months):
    ages = [group["id"] for group in meta["ageGroups"]]
    keys = [(month, age) for month in months for age in ages]
    key_months = [month for month, _ in keys]
    codes = []
    features = []
    for category in meta["minorCategories"]:
        code = category["code"]
        rows = [profiles.get((code, age, month)) for month, age in keys]
        if not all(_usable(row, metric) for row in rows):
            continue
        if len({row["segment"] for row in rows}) != 1:
            continue
        codes.append(code)
        features.append(_log_values(rows, key_months, metric))

    if len(codes) < 2:
        return None

    vectors = {key: _clr(values) for key, values in zip(keys, zip(*features))}
    return codes, vectors


def _centers(blocks, ages, months):
    return {
        age: {
            metric: tuple(map(fmean, zip(*(vectors[month, age] for month in months))))
            for metric, (_, vectors) in blocks.items()
        }
        for age in ages
    }


def _distance(left, right):
    return sqrt(fmean(
        fmean((a - b) ** 2 for a, b in zip(values, right[metric]))
        for metric, values in left.items()
    ))


def _nearest(distances):
    minimum = min(distances.values())
    return [age for age, distance in distances.items() if isclose(distance, minimum, abs_tol=1e-10)]


def _test_vector(profiles, blocks, age, test_month, reference_month):
    vector = {}
    for metric, (codes, _) in blocks.items():
        rows = [profiles.get((code, age, test_month)) for code in codes]
        if not all(_usable(row, metric) and row["segment"] == profiles[code, age, reference_month]["segment"]
                   for code, row in zip(codes, rows)):
            return None
        vector[metric] = _clr(_log_values(rows, [test_month] * len(rows), metric))
    return vector or None


def build_group_profiles(meta, profiles, representative_codes):
    months = meta["months"]
    ages = [group["id"] for group in meta["ageGroups"]]
    if len(months) < 2 or len(ages) < 2:
        return None
    metrics = ["avgDays", "avgDailyTime"] if meta["metrics"]["dailyTime"] else ["avgDays"]
    blocks = {metric: block for metric in metrics if (block := _clr_block(meta, profiles, metric, months))}
    if not blocks:
        return None

    full = _centers(blocks, ages, months)
    held = {age: [] for age in ages}
    for month in months:
        training_months = [candidate for candidate in months if candidate != month]
        training_blocks = {
            metric: block for metric in metrics if (block := _clr_block(meta, profiles, metric, training_months))
        }
        training = _centers(training_blocks, ages, training_months)
        for age in ages:
            sample = _test_vector(profiles, training_blocks, age, month, training_months[0])
            nearest = _nearest({candidate: _distance(sample, training[candidate]) for candidate in ages}) if sample else None
            held[age].append({"month": month, "nearest": nearest})

    groups = {}
    for age in ages:
        distances = {other: _distance(full[age], full[other]) for other in ages if other != age}
        ordered = sorted(distances.items(), key=lambda item: item[1])
        closest = _nearest(dict(ordered))
        first = ordered[0][0]
        runner_up = ordered[1][0] if len(ordered) > 1 else None
        near_tie = runner_up is not None and distance_gap_ratio(ordered[0][1], ordered[1][1]) < NEAR_TIE
        differences = []
        for metric, (codes, _) in blocks.items():
            gaps = [(code, a - b) for code, a, b in zip(codes, full[age][metric], full[first][metric])
                    if code in representative_codes]
            examples = sorted(gaps, key=lambda pair: (-abs(pair[1]), pair[0]))[:2]
            differences.extend({
                "minorCode": code, "metric": metric, "emphasizedAge": age if gap > 0 else first,
            } for code, gap in examples if abs(gap) > 1e-10)
        groups[age] = {
            "closestAges": closest,
            "distances": [{"age": other, "distance": distance} for other, distance in ordered],
            "runnerUpAge": runner_up,
            "nearTie": near_tie,
            "comparisonAge": first,
            "differences": differences,
            "heldOut": held[age],
            "testedMonths": sum(item["nearest"] is not None for item in held[age]),
            "sameGroupMonths": sum(item["nearest"] == [age] for item in held[age]),
        }
    return {"featureCounts": {metric: len(codes) for metric, (codes, _) in blocks.items()},
            "nearTiePercent": round(NEAR_TIE * 100), "groups": groups}
