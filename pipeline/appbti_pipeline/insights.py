"""정제 CSV로 AppBTI의 발표용 집단 인사이트를 계산한다."""

from argparse import ArgumentParser
from calendar import monthrange
from itertools import combinations
import json
from math import dist, exp, log
from pathlib import Path
from statistics import fmean, geometric_mean
import sys

import pandas as pd

from .adapter import load_codebook
from .export import write_json


DEFAULT_CODEBOOK = Path(__file__).resolve().parents[2] / "config" / "codebook.yaml"
REQUIRED = {"month", "age_group", "major", "minor_name", "minor_code", "uu", "avg_days", "avg_daily_time", "status"}
INDEX = ["month", "age_group"]
NEAR_TIE = 0.05
STABLE_HIGH = 1.2
STABLE_LOW = 0.83
QUADRANTS = {
    (True, True): "자주·오래",
    (True, False): "자주·짧게",
    (False, True): "덜 자주·오래",
    (False, False): "덜 자주·짧게",
}


class ColumnMismatch(ValueError):
    def __init__(self, columns):
        self.columns = columns


class InputError(ValueError):
    """입력 행의 내용을 노출하지 않는 검증 오류."""


def read_clean(path, book, months):
    columns = pd.read_csv(path, encoding="utf-8-sig", nrows=0).columns.tolist()
    if not REQUIRED.issubset(columns):
        raise ColumnMismatch(columns)
    frame = pd.read_csv(path, encoding="utf-8-sig", dtype="string")
    frame = frame.apply(lambda column: column.str.strip())
    age_labels = {group["label"]: group["id"] for group in book["age_groups"]}
    age_ids = {group["id"] for group in book["age_groups"]}
    frame["age_group"] = frame["age_group"].replace(age_labels)
    frame["month"] = frame["month"].str.replace(r"^([0-9]{4})([0-9]{2})$", r"\1-\2", regex=True)
    if not frame["month"].isin(months).all() or not frame["age_group"].isin(age_ids).all():
        raise InputError("코드북과 입력의 기준월 또는 연령대가 다릅니다.")
    if frame.duplicated([*INDEX, "minor_code"]).any():
        raise InputError("월·연령대·중분류가 중복된 행이 있습니다.")
    categories = frame[["minor_code", "minor_name", "major"]]
    if categories.isna().any().any() or categories.eq("").any().any():
        raise InputError("중분류 코드·이름·대분류가 비어 있습니다.")
    frame = frame[~frame["minor_name"].isin(book.get("exclude_minor_names", []))].copy()
    statuses = frame["status"].replace(book.get("statuses", {}))
    if not statuses.dropna().isin(["normal", "missing", "suppressed"]).all():
        raise InputError("지원하지 않는 데이터 상태가 있습니다.")
    for metric in ("uu", "avg_days", "avg_daily_time"):
        values = pd.to_numeric(frame[metric], errors="coerce").astype(float)
        frame[metric] = values.where(statuses.eq("normal") & values.ge(0) & values.lt(float("inf")))
    if "time_unit" in frame:
        known = frame["time_unit"].notna() & frame["time_unit"].ne("") & frame["avg_daily_time"].notna()
        if not frame.loc[known, "time_unit"].isin(["분", "minutes"]).all():
            raise InputError("정제 CSV의 이용시간을 분으로 맞춰 주세요.")
    limits = frame["month"].map({month: days_in_month(month) for month in months})
    frame["avg_days"] = frame["avg_days"].where(frame["avg_days"].le(limits))
    return frame


def days_in_month(month):
    year, month_number = map(int, month.split("-"))
    return monthrange(year, month_number)[1]


def monthly_tables(frame, months, ages):
    index = pd.MultiIndex.from_product([months, ages], names=INDEX)
    return {
        metric: frame.pivot(index=INDEX, columns="minor_code", values=metric).reindex(index)
        for metric in ("uu", "avg_days", "avg_daily_time")
    }


def representative_codes(users, age_count, month_count):
    monthly_totals = users.groupby(level="month").sum(min_count=age_count)
    medians = monthly_totals.loc[:, monthly_totals.count().eq(month_count)].median()
    eligible = set(medians.index[medians.ge(medians.quantile(0.2))]) if not medians.empty else set()
    return eligible, len(medians)


def joint_clr(days, minutes):
    common = (days.gt(0) & minutes.gt(0)).all()
    ratio = days.loc[:, common].div(
        [days_in_month(month) for month in days.index.get_level_values("month")], axis="index"
    )
    logs = pd.concat({"days": ratio, "time": minutes.loc[:, common]}, axis=1).map(log)
    return logs.sub(logs.mean(axis="columns"), axis="index")


def insight(headline, chart_data, method_note):
    return {"headline": headline, "chart_data": chart_data, "method_note": method_note}


def linkage(matrix):
    clusters = {i: [i] for i in range(len(matrix))}
    merges = []
    while len(clusters) > 1:
        distance, left, right = min(
            (fmean(matrix[i][j] for i in clusters[left] for j in clusters[right]), left, right)
            for left, right in combinations(clusters, 2)
        )
        merged = clusters.pop(left) + clusters.pop(right)
        clusters[len(matrix) + len(merges)] = merged
        merges.append([left, right, distance, len(merged)])
    return merges


def generation_map(clr, ages, labels):
    method = "월별 이용일 비율·이용시간을 함께 CLR한 뒤 기간 평균 벡터의 유클리드 거리와 평균 연결 계층을 계산했습니다."
    chart = {"age_order": ages, "distance_matrix": None, "nearest": [], "adjacent": [], "linkage": [],
             "largest_adjacent_gap": None,
             "category_count": clr.shape[1] // 2}
    if not clr.shape[1]:
        return insight("거리 비교에 쓸 공통 중분류는 0개였습니다.", chart, method)
    centers = clr.groupby(level="age_group").mean().reindex(ages).to_numpy().tolist()
    matrix = [[dist(left, right) for right in centers] for left in centers]
    nearest = []
    for i, age in enumerate(ages):
        ((first, j), (second, k)) = sorted((d, j) for j, d in enumerate(matrix[i]) if j != i)[:2]
        gap = (second - first) / second if second else 0.0
        nearest.append({"age_group": age, "closest_age": ages[j], "closest_distance": first,
                        "second_age": ages[k], "second_distance": second, "gap_ratio": gap, "near_tie": gap < NEAR_TIE})
    adjacent = [{"left": left, "right": right, "distance": matrix[i][i + 1]}
                for i, (left, right) in enumerate(zip(ages, ages[1:]))]
    boundary = max(adjacent, key=lambda item: item["distance"])
    chart.update(distance_matrix=matrix, nearest=nearest, adjacent=adjacent, linkage=linkage(matrix))
    chart["largest_adjacent_gap"] = boundary
    headline = (f"{labels[boundary['left']]}–{labels[boundary['right']]} 사이가 "
                f"인접 연령대 중 가장 멀었고, CLR 거리는 {boundary['distance']:.3g}였습니다.")
    return insight(headline, chart, method)


def geometric(values):
    values = list(values)
    return 0.0 if 0 in values else geometric_mean(values)


def frequency_duration(days, minutes, ages, categories, eligible):
    method = "중분류별 공통 관측월의 기하평균을 구해 전체 비교점의 지표별 중앙값으로 분면을 나눴습니다."
    points = []
    for code in days:
        valid = (days[code].notna() & minutes[code].notna()).groupby(level="month").all()
        months = valid.index[valid].tolist()
        if not months:
            continue
        for age in ages:
            keys = [(month, age) for month in months]
            points.append({**categories[code], "age_group": age, "common_months": months,
                           "days": geometric(days.loc[keys, code]), "minutes": geometric(minutes.loc[keys, code])})
    if not points:
        return insight("두 지표를 함께 비교할 수 있는 지점은 0개였습니다.",
                       {"thresholds": None, "points": [], "top_switching": []}, method)

    thresholds = pd.DataFrame(points)[["days", "minutes"]].median().to_dict()
    quadrants = {}
    for point in points:
        quadrant = QUADRANTS[point["days"] >= thresholds["days"], point["minutes"] >= thresholds["minutes"]]
        point["quadrant"] = quadrant
        quadrants.setdefault(point["minor_code"], []).append(quadrant)
    switching = []
    for code, labels in quadrants.items():
        count = len(set(labels))
        if count > 1 and code in eligible:
            switching.append({**categories[code], "quadrant_count": count,
                              "crossing_pairs": sum(left != right for left, right in combinations(labels, 2))})
    switching.sort(key=lambda row: (-row["quadrant_count"], -row["crossing_pairs"], row["minor_code"]))
    if switching:
        lead = switching[0]
        headline = (f"대표 비교 대상 중 {len(switching)}개 중분류에서 연령대에 따라 분면이 달랐고, "
                    f"{lead['minor_name']}의 연령대는 {lead['quadrant_count']}개 분면에 걸쳤습니다.")
    else:
        headline = "대표 비교 대상 중 연령대에 따라 분면이 달라진 중분류는 0개였습니다."
    return insight(headline, {"thresholds": thresholds, "points": points, "top_switching": switching[:10]}, method)


def category_patterns(clr, ages, labels, categories, eligible, months):
    target = "CLR 뒤 월·중분류·지표별 연령대 평균을 빼고 두 지표와 기간을 같은 비중으로 합쳐 배수로 표시했습니다."
    stability_note = "기간 전체와 같은 방향으로 월별 배수가 1.2배를 넘거나 0.83배 미만인 달을 셌습니다."
    signatures = {age: [] for age in ages}
    chart = {"signatures": signatures, "common": [], "points": []}
    stability_chart = {"thresholds": {"higher": STABLE_HIGH, "lower": STABLE_LOW}, "patterns": []}
    if not clr.shape[1]:
        return (
            insight("공통 패턴 계산에 쓸 중분류는 0개였습니다.", chart, target),
            insight("월별 반복 여부를 확인할 시그니처는 0건이었습니다.", stability_chart, stability_note),
        )
    centered = clr - clr.groupby(level="month").transform("mean")
    days, time = centered["days"], centered["time"]
    monthly = (days + time) / 2
    avg = monthly.groupby(level="age_group").mean().reindex(ages)
    days_avg, time_avg = (block.groupby(level="age_group").mean() for block in (days, time))
    allowed = [code for code in avg if code in eligible]
    points = {(age, code): {**categories[code], "age_group": age, "multiplier": exp(avg.loc[age, code]),
                            "days_multiplier": exp(days_avg.loc[age, code]), "time_multiplier": exp(time_avg.loc[age, code])}
              for age in ages for code in avg}
    patterns = []
    for age in ages:
        ranked = sorted(allowed, key=lambda code: (-avg.loc[age, code], code))[:5]
        signatures[age] = [points[age, code] for code in ranked]
        for code in ranked:
            score = avg.loc[age, code]
            direction = "higher" if score > 0 else "lower" if score < 0 else "flat"
            evidence = []
            for month in months:
                value = monthly.loc[(month, age), code]
                matches = (direction == "higher" and value > log(STABLE_HIGH)) or (direction == "lower" and value < log(STABLE_LOW))
                evidence.append({"month": month, "multiplier": exp(value), "matches": bool(matches)})
            patterns.append({**points[age, code], "direction": direction,
                             "matching_months": sum(row["matches"] for row in evidence), "months": evidence})
    variation = avg.std(ddof=0)
    common = sorted(allowed, key=lambda code: (variation[code], code))[:5]
    chart.update(points=list(points.values()),
                 common=[{**categories[code], "clr_stddev": variation[code]} for code in common])
    if patterns:
        lead = max(patterns, key=lambda item: item["multiplier"])
        headline = (f"{labels[lead['age_group']]}의 {lead['minor_name']} 상대 패턴은 "
                    f"CLR 기준 {lead['multiplier']:.2f}배였고, 편차가 작은 공통 사례 {len(common)}개를 골랐습니다.")
        most = max(pattern["matching_months"] for pattern in patterns)
        stable_headline = (f"연령대별 대표 시그니처 {len(patterns)}건 중 가장 자주 반복된 차이는 "
                           f"{len(months)}개월 중 {most}개월에 같은 방향 기준을 충족했습니다.")
    else:
        headline = "이용자 수 기준을 충족한 공통·시그니처 후보는 0개였습니다."
        stable_headline = "월별 반복 여부를 확인할 시그니처는 0건이었습니다."
    stability_chart["patterns"] = patterns
    return (
        insight(headline, chart, target),
        insight(stable_headline, stability_chart, stability_note),
    )


def analyze(frame, book, months):
    ages = [group["id"] for group in book["age_groups"]]
    labels = {group["id"]: group["label"] for group in book["age_groups"]}
    catalog = frame[["minor_code", "minor_name", "major"]].drop_duplicates().sort_values("minor_code")
    if catalog["minor_code"].duplicated().any():
        raise InputError("같은 중분류 코드에 서로 다른 명칭 또는 대분류가 있습니다.")
    categories = {row["minor_code"]: row for row in catalog.to_dict("records")}
    tables = monthly_tables(frame, months, ages)
    days, minutes = tables["avg_days"], tables["avg_daily_time"]
    eligible, ranked_count = representative_codes(tables["uu"], len(ages), len(months))
    clr = joint_clr(days, minutes)
    patterns, stability = category_patterns(clr, ages, labels, categories, eligible, months)
    return {
        "schema_version": 1, "is_mock": bool(book.get("is_mock")), "months": months, "age_groups": book["age_groups"],
        "representative_selection": {"ranked_category_count": ranked_count, "eligible_category_count": len(eligible),
                                     "excluded_below_quantile": 0.2},
        "insights": {
            "generation_map": generation_map(clr, ages, labels),
            "frequency_duration": frequency_duration(days, minutes, ages, categories, eligible),
            "common_signature": patterns,
            "stability": stability,
        },
    }


def main():
    parser = ArgumentParser(description="정제 CSV에서 네 개의 연령대 인사이트를 계산합니다.")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--codebook", type=Path, default=DEFAULT_CODEBOOK, help="연령대·기간 설정을 읽습니다.")
    args = parser.parse_args()
    try:
        if args.input.resolve() == args.out.resolve():
            raise InputError("입력 파일과 출력 파일은 서로 달라야 합니다.")
        book = load_codebook(args.codebook)
        months = [str(month) for month in pd.period_range(book["period"]["start"], book["period"]["end"], freq="M")]
        if len(book["age_groups"]) != 6 or len(months) != 6:
            raise InputError("코드북에 여섯 연령대와 여섯 달이 필요합니다.")
        if any(months[0] < month <= months[-1] for month in book.get("continuity_breaks", [])):
            raise InputError("집계 기준이 달라진 달을 포함한 기간은 한 결과로 합칠 수 없습니다.")
        result = analyze(read_clean(args.input, book, months), book, months)
        write_json(args.out, result)
    except ColumnMismatch as error:
        print(json.dumps(error.columns, ensure_ascii=False))
        return 2
    except InputError as error:
        print(error, file=sys.stderr)
        return 2
    except (OSError, ValueError, KeyError, TypeError):
        print("입력 또는 출력 파일을 처리하지 못했습니다.", file=sys.stderr)
        return 2
    for item in result["insights"].values():
        print(item["headline"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
