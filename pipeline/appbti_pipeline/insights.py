"""정제 CSV로 AppBTI의 발표용 집단 인사이트를 계산한다."""

from argparse import ArgumentParser
from itertools import combinations
import json
from math import dist, exp, isclose, log
from pathlib import Path
from statistics import fmean, geometric_mean
import sys

import pandas as pd

from .adapter import load_codebook
from .composition_index import composition_indices, reference_category
from .export import write_json
from .relative_patterns import NEAR_TIE, STABLE_HIGH, STABLE_LOW, center_by_age, days_in_month, distance_gap_ratio, joint_clr
from .representative import EXCLUDED_BELOW_QUANTILE, is_other, representative_codes


DEFAULT_CODEBOOK = Path(__file__).resolve().parents[2] / "config" / "codebook.yaml"
REQUIRED = {"month", "age_group", "major", "minor_name", "minor_code", "uu", "avg_days", "avg_daily_time", "status"}
INDEX = ["month", "age_group"]
QUADRANT_BAND = 0.1
VISIBLE_MULTIPLIER = 1.05


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


def monthly_tables(frame, months, ages):
    index = pd.MultiIndex.from_product([months, ages], names=INDEX)
    return {
        metric: frame.pivot(index=INDEX, columns="minor_code", values=metric).reindex(index)
        for metric in ("uu", "avg_days", "avg_daily_time")
    }


def composition_summary(users, book, age_count):
    reference = reference_category(book)
    if reference is None:
        return None
    totals = users.groupby(level="month").transform("sum", min_count=age_count)
    shares = users.div(totals.where(totals.gt(0)))
    indices = composition_indices(shares.stack(future_stack=True).to_dict(), reference["minorCode"])
    return {"reference": reference, "baseline": 1, "points": [
        {"month": month, "age_group": age, "minor_code": code,
         "index": round(value, 6) if value is not None else None}
        for (month, age, code), value in indices.items()
    ]}


def insight(headline, chart_data, method_note):
    return {"headline": headline, "chart_data": chart_data, "method_note": method_note}


def home_overview(tables, book, months, categories, eligible):
    month = months[-1]
    days, time, users = (tables[key].xs(month, level="month") for key in ("avg_days", "avg_daily_time", "uu"))
    selected = dict.fromkeys(book.get("home_overview", {}).get("minor_codes", []))
    services = []
    stories = {"days": [], "minutes": []}
    for code in selected:
        if code not in categories:
            continue
        metrics = {"days": days[code], "minutes": time[code]}
        row = {**categories[code]}
        for metric, series in metrics.items():
            row[metric] = {age: None if pd.isna(value) else float(value) for age, value in series.items()}
            observed = series.dropna()
            peak = float(observed.max()) if not observed.empty else None
            leading = [age for age, value in observed.items() if value == peak]
            row[metric + "_leaders"] = leading if 0 < len(leading) < len(series) else []
            if code in eligible and series.notna().all():
                stories[metric].append({**categories[code], "leaders": leading,
                                        "max": peak, "gap": float(series.max() - series.min())})
        services.append(row)
    highlights = {}
    for metric, candidates in stories.items():
        ordered = sorted(candidates, key=lambda item: (-item["gap"], item["minor_code"]))
        highlights[metric] = {"largest": ordered[0] if ordered else None,
                              "smallest": ordered[-1] if len(ordered) > 1 else None}
    totals = users.sum(min_count=len(book["age_groups"])).dropna()
    rank = sorted((code for code in totals.index if not is_other(categories[code]["minor_name"])),
                  key=lambda code: (-totals[code], code))
    return {"month": month, "services": services, "highlights": highlights,
            "top_users": [{**categories[code], "total": int(totals[code])} for code in rank[:5]]}


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


def with_josa(word, vowel, consonant):
    last = ord(word[-1])
    return word + (consonant if 0xAC00 <= last <= 0xD7A3 and (last - 0xAC00) % 28 else vowel)


def generation_map(clr, ages, labels):
    method = "월별 이용일 비율·이용시간을 함께 CLR한 뒤 기간 평균 벡터의 유클리드 거리와 평균 연결 계층을 계산했습니다."
    chart = {"age_order": ages, "distance_matrix": None, "nearest": [], "adjacent": [], "linkage": [],
             "largest_adjacent_gap": None,
             "category_count": clr.shape[1] // 2}
    if not clr.shape[1]:
        return insight("이용 패턴을 함께 비교할 서비스가 없어요.", chart, method)
    centers = clr.groupby(level="age_group").mean().reindex(ages).to_numpy().tolist()
    matrix = [[dist(left, right) for right in centers] for left in centers]
    nearest = []
    for i, age in enumerate(ages):
        ((first, j), (second, k)) = sorted((d, j) for j, d in enumerate(matrix[i]) if j != i)[:2]
        gap = distance_gap_ratio(first, second)
        nearest.append({"age_group": age, "closest_age": ages[j], "closest_distance": first,
                        "second_age": ages[k], "second_distance": second, "gap_ratio": gap, "near_tie": gap < NEAR_TIE})
    adjacent = [{"left": left, "right": right, "distance": matrix[i][i + 1]}
                for i, (left, right) in enumerate(zip(ages, ages[1:]))]
    boundary = max(adjacent, key=lambda item: item["distance"])
    chart.update(distance_matrix=matrix, nearest=nearest, adjacent=adjacent, linkage=linkage(matrix))
    chart["largest_adjacent_gap"] = boundary
    headline = (f"이웃한 연령대 중 {with_josa(labels[boundary['left']], '와', '과')} "
                f"{labels[boundary['right']]}의 이용 차이가 가장 커요.")
    return insight(headline, chart, method)


def geometric(values):
    values = list(values)
    return 0.0 if 0 in values else geometric_mean(values)


def service_level(value, reference):
    lower = reference - reference * QUADRANT_BAND
    upper = reference + reference * QUADRANT_BAND
    if value < lower and not isclose(value, lower, rel_tol=1e-12):
        return -1
    if value > upper and not isclose(value, upper, rel_tol=1e-12):
        return 1
    return 0


def frequency_duration(days, minutes, ages, categories, eligible, preferred_services=frozenset()):
    method = ("중분류별 공통 관측월의 지표 기하평균을 연령대마다 구한 뒤, 같은 서비스의 여섯 연령대 값을 "
              "동일 가중 평균했습니다.\n한 지표라도 평균 대비 ±10% 범위면 분면 전환에서 제외했습니다.")
    points = []
    thresholds = {}
    switching = []
    for code in days:
        valid = (days[code].notna() & minutes[code].notna()).groupby(level="month").all()
        months = valid.index[valid].tolist()
        if not months:
            continue
        service = []
        for age in ages:
            keys = [(month, age) for month in months]
            service.append({**categories[code], "age_group": age, "common_months": months,
                            "days": geometric(days.loc[keys, code]), "minutes": geometric(minutes.loc[keys, code])})
        mean = {metric: fmean(point[metric] for point in service) for metric in ("days", "minutes")}
        thresholds[code] = mean
        quadrants = []
        for point in service:
            days_level = service_level(point["days"], mean["days"])
            time_level = service_level(point["minutes"], mean["minutes"])
            point.update(days_level=days_level, time_level=time_level)
            if days_level and time_level:
                quadrants.append((days_level, time_level))
                frequency = "자주" if days_level > 0 else "덜 자주"
                duration = "오래" if time_level > 0 else "짧게"
                point["quadrant"] = f"이 서비스 평균보다 {frequency}·{duration} 써요"
            else:
                days_label = {-1: "덜 자주", 0: "평균 수준", 1: "더 자주"}[days_level]
                time_label = {-1: "짧게", 0: "평균 수준", 1: "오래"}[time_level]
                point["quadrant"] = f"이 서비스 평균 대비 이용일수 {days_label}, 이용시간 {time_label}"
        points.extend(service)
        count = len(set(quadrants))
        if count > 1 and code in eligible:
            switching.append({**categories[code], "quadrant_count": count,
                              "crossing_pairs": sum(left != right for left, right in combinations(quadrants, 2))})
    switching.sort(key=lambda row: (row["minor_code"] not in preferred_services,
                                    -row["quadrant_count"], -row["crossing_pairs"], row["minor_code"]))
    headline = f"서비스별 평균과 비교하니 {len(switching)}개 서비스에서 연령대별 이용 방식이 갈렸어요."
    return insight(headline, {"thresholds": thresholds, "band": QUADRANT_BAND, "points": points,
                              "switching_count": len(switching), "switching": switching,
                              "top_switching": switching[:10]}, method)


def category_patterns(clr, ages, labels, categories, eligible, months, preferred_services):
    target = "CLR 뒤 월·중분류·지표별 연령대 평균을 빼고 두 지표와 기간을 같은 비중으로 합쳐 배수로 표시했습니다."
    stability_note = "기간 전체와 같은 방향으로 월별 배수가 1.2배를 넘거나 0.83배 미만인 달을 셌습니다."
    signatures = {age: [] for age in ages}
    chart = {"signatures": signatures, "common": [], "points": [], "monthly_points": [], "major_summary": [], "baseline": 1}
    stability_chart = {"thresholds": {"higher": STABLE_HIGH, "lower": STABLE_LOW}, "patterns": []}
    if not clr.shape[1]:
        return (
            insight("연령대별 이용 패턴을 함께 비교할 서비스가 없어요.", chart, target),
            insight("여러 달 비교할 대표 서비스가 없어요.", stability_chart, stability_note),
        )
    centered = center_by_age(clr)
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
        stable_codes = dict.fromkeys([*ranked, *(code for code in allowed if code in preferred_services)])
        for code in stable_codes:
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
    major_codes = {}
    for code in avg:
        major_codes.setdefault(categories[code]["major"], []).append(code)
    for major, codes in sorted(major_codes.items()):
        regular = [code for code in codes if not is_other(categories[code]["minor_name"])]
        for age in ages:
            chart["major_summary"].append({"age_group": age, "major": major,
                                           "all": exp(fmean(avg.loc[age, codes])),
                                           "regular": exp(fmean(avg.loc[age, regular])) if regular else None})
    chart.update(points=list(points.values()), monthly_points=[
        {"month": month, "minor_code": code, "age_group": age, "days_multiplier": exp(days.loc[(month, age), code]),
         "time_multiplier": exp(time.loc[(month, age), code])}
        for month in months for age in ages for code in avg
    ],
                 common=[{**categories[code], "clr_stddev": variation[code]} for code in common])
    if patterns:
        lead = max(patterns, key=lambda item: item["multiplier"])
        headline = (f"{labels[lead['age_group']]}의 {lead['minor_name']} 이용은 다른 연령대보다 두드러져요"
                    f"(약 {lead['multiplier']:.1f}배).") if lead["multiplier"] >= VISIBLE_MULTIPLIER else (
                        "대표 서비스는 연령대 평균과 비슷하게 나타났어요.")
        stable = max(patterns, key=lambda pattern: pattern["matching_months"])
        direction = "높게" if stable["direction"] == "higher" else "낮게"
        stable_headline = (f"{labels[stable['age_group']]}의 {stable['minor_name']} 이용은 연령대 평균보다 {direction} 나타났어요"
                           f"({len(months)}개월 중 {stable['matching_months']}개월).") if stable["matching_months"] else (
                               f"대표 사례 {len(patterns)}건에서 같은 방향의 차이가 반복된 달은 없어요.")
    else:
        headline = "조건을 충족한 대표 서비스가 없어요."
        stable_headline = "여러 달 비교할 대표 서비스가 없어요."
    stability_chart["patterns"] = patterns
    return (
        insight(headline, chart, target),
        insight(stable_headline, stability_chart, stability_note),
    )


def distinct_cases(candidates, age_names, service_codes=frozenset()):
    if not candidates:
        return []
    best = []
    best_count = -1
    for candidate in [*candidates[0], None]:
        age = candidate["age_group"] if candidate else None
        code = candidate["minor_code"] if candidate else None
        if age in age_names or code in service_codes:
            continue
        tail = distinct_cases(candidates[1:], age_names | {age} if candidate else age_names,
                              service_codes | {code} if candidate else service_codes)
        cases = [candidate, *tail]
        count = sum(case is not None for case in cases)
        if count > best_count:
            best = cases
            best_count = count
        if count == len(candidates):
            break
    return best


def spotlight_cases(results, months, labels, eligible, preferred_services):
    generation = results["generation_map"]["chart_data"]["largest_adjacent_gap"]
    used_ages = {generation["left"], generation["right"]} if generation else set()
    frequency = results["frequency_duration"]["chart_data"]
    signatures = results["common_signature"]["chart_data"]
    stability = results["stability"]["chart_data"]["patterns"]
    frequency_cases = [point for service in frequency["top_switching"] for point in frequency["points"]
                       if service["minor_code"] == point["minor_code"] and point["days_level"] and point["time_level"]]
    ranked_keys = {(point["age_group"], point["minor_code"]) for rows in signatures["signatures"].values() for point in rows}
    preferred_eligible = preferred_services & eligible
    signature_cases = sorted(
        (point for point in signatures["points"] if point["multiplier"] >= VISIBLE_MULTIPLIER and (
            point["minor_code"] in preferred_eligible
            or (point["age_group"], point["minor_code"]) in ranked_keys
        )), key=lambda point: (point["minor_code"] not in preferred_services, -point["multiplier"]),
    )
    stable_cases = sorted((point for point in stability if point["matching_months"]),
                          key=lambda point: (point["minor_code"] not in preferred_services,
                                             -point["matching_months"], -abs(log(point["multiplier"]))))
    selected = distinct_cases([frequency_cases, signature_cases, stable_cases], used_ages)
    spotlights = {"generation_map": {"age_group": generation["left"]} if generation else None}
    for key, case in zip(("frequency_duration", "common_signature", "stability"), selected):
        spotlights[key] = None
        if case is None:
            continue
        age = labels[case["age_group"]]
        service = case["minor_name"]
        if key == "frequency_duration":
            headline = f"{age}의 {service} 이용 · {case['quadrant']}"
        elif key == "common_signature":
            headline = f"{age}의 {service} 이용은 다른 연령대보다 두드러져요(약 {case['multiplier']:.1f}배)."
        else:
            direction = "높게" if case["direction"] == "higher" else "낮게"
            headline = (f"{age}의 {service} 이용은 연령대 평균보다 {direction} 나타났어요"
                        f"({len(months)}개월 중 {case['matching_months']}개월).")
        spotlights[key] = {"age_group": case["age_group"], "minor_code": case["minor_code"], "headline": headline}
    return spotlights


def detective(patterns):
    candidates = [point for point in patterns if is_other(point["minor_name"]) and point["multiplier"] >= 2]
    if not candidates:
        return None
    widest = max(candidates, key=lambda point: point["multiplier"])
    hypothesis = ("자녀 보호 앱의 백그라운드 실행이 집계에 포함됐을 가능성이 있어요."
                  if widest["major"] == "가족" else "서로 다른 서비스의 이용 기록이 이 분류에 섞였을 가능성이 있어요.")
    return {**widest, "hypothesis": hypothesis}


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
    eligible = {code for code in eligible if not is_other(categories[code]["minor_name"])}
    preferred_services = set(book.get("home_overview", {}).get("minor_codes", []))
    clr = joint_clr(days, minutes)
    patterns, stability = category_patterns(clr, ages, labels, categories, eligible, months, preferred_services)
    results = {"generation_map": generation_map(clr, ages, labels),
               "frequency_duration": frequency_duration(days, minutes, ages, categories, eligible, preferred_services),
               "common_signature": patterns, "stability": stability}
    return {
        "schema_version": 2, "is_mock": bool(book.get("is_mock")), "months": months, "age_groups": book["age_groups"],
        "representative_selection": {"ranked_category_count": ranked_count, "eligible_category_count": len(eligible),
                                     "excluded_below_quantile": EXCLUDED_BELOW_QUANTILE},
        "composition_index": composition_summary(tables["uu"], book, len(ages)),
        "overview": home_overview(tables, book, months, categories, eligible),
        "insights": results,
        "spotlights": spotlight_cases(results, months, labels, eligible, preferred_services),
        "detective": detective(patterns["chart_data"]["points"]),
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
