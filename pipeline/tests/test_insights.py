"""가상 집계로 CLI 산식과 출력 범위를 점검한다."""

import json
from math import isclose, prod
import os
from pathlib import Path
import subprocess
import sys

import pandas as pd

from appbti_pipeline.adapter import load_codebook, read_source
from appbti_pipeline.insights import distinct_cases, frequency_duration, service_level
from appbti_pipeline.relative_patterns import NEAR_TIE, distance_gap_ratio
from appbti_pipeline.representative import major_codes, representative_codes


ROOT = Path(__file__).resolve().parents[2]


def test_representative_filter_on_mock():
    index = pd.MultiIndex.from_product([["2025-01", "2025-02"], list("ABCDEF")], names=["month", "age_group"])
    users = pd.DataFrame({"low": 1.0, "at_cutoff_one": 10.0, "at_cutoff_two": 10.0, "high": 15.0,
                          "higher": 20.0, "highest": 25.0, "top_month_only": [40.0] * 6 + [None] * 6}, index=index)
    assert representative_codes(users, 6, 2) == ({"at_cutoff_one", "at_cutoff_two", "high", "higher", "highest"}, 6)
    assert representative_codes(users[["low"]] * 0, 6, 2) == (set(), 1)


def test_major_services_are_top_quarter_on_mock():
    # 가상 값: 월별 합계 중앙값 6, 60, 60, 90, 120, 150 → 상위 25%(112.5 이상)는 higher, highest.
    index = pd.MultiIndex.from_product([["2025-01", "2025-02"], list("ABCDEF")], names=["month", "age_group"])
    users = pd.DataFrame({"low": 1.0, "at_cutoff_one": 10.0, "at_cutoff_two": 10.0, "high": 15.0,
                          "higher": 20.0, "highest": 25.0, "top_month_only": [40.0] * 6 + [None] * 6}, index=index)
    assert major_codes(users, 6, 2) == {"higher", "highest"}
    assert major_codes(users[["low"]] * 0, 6, 2) == set()


def test_distance_near_tie_threshold_on_mock():
    assert distance_gap_ratio(0, 0) < NEAR_TIE
    assert distance_gap_ratio(19.1, 20) < NEAR_TIE
    assert distance_gap_ratio(19, 20) == NEAR_TIE
    assert distance_gap_ratio(18.9, 20) > NEAR_TIE


def test_quadrants_use_each_service_mean_and_allow_ten_percent():
    ages = list("ABCDEF")
    index = pd.MultiIndex.from_product([["2025-01"], ages], names=["month", "age_group"])
    days = pd.DataFrame({"frequent": [5, 9, 10, 11, 15, 10], "occasional": [.5, .9, 1, 1.1, 1.5, 1]}, index=index)
    minutes = days * 4
    catalog = {code: {"minor_code": code, "minor_name": code, "major": "가상"} for code in days}
    chart = frequency_duration(days, minutes, ages, catalog, set(days))["chart_data"]
    assert chart["switching_count"] == 2
    assert isclose(chart["thresholds"]["frequent"]["days"], 10)
    assert isclose(chart["thresholds"]["occasional"]["days"], 1)
    assert service_level(9, 10) == service_level(11, 10) == 0
    assert service_level(8.99, 10) == -1
    assert service_level(11.01, 10) == 1
    for group in ("B", "D"):
        assert all(not row["days_level"] and not row["time_level"] for row in chart["points"] if row["age_group"] == group)


def test_quadrant_choices_include_all_counted_categories():
    ages = list("ABCDEF")
    index = pd.MultiIndex.from_product([["2025-01"], ages], names=["month", "age_group"])
    codes = [f"category_{i:02d}" for i in range(12)]
    days = pd.DataFrame({code: [5, 9, 10, 11, 15, 10] for code in codes}, index=index)
    catalog = {code: {"minor_code": code, "minor_name": code, "major": "가상"} for code in codes}
    chart = frequency_duration(days, days * 4, ages, catalog, set(codes[1:]))["chart_data"]
    assert chart["switching_count"] == 11
    assert [row["minor_code"] for row in chart["switching"]] == codes[1:]
    assert len(chart["top_switching"]) == 10


def test_home_cases_find_non_overlapping_services_and_ages():
    def point(age, code):
        return {"age_group": age, "minor_code": code}

    choices = [[point("C", "one"), point("D", "two")], [point("C", "three")], [point("E", "one")]]
    assert distinct_cases(choices, {"A", "B"}) == [point("D", "two"), point("C", "three"), point("E", "one")]
    assert distinct_cases([[point("A", "one")]], {"A"}) == [None]


def test_insights_cli_on_mock(tmp_path):
    codebook = ROOT / "config" / "codebook.mock.yaml"
    frame = read_source(ROOT / "data" / "mock" / "with_time", load_codebook(codebook))
    month_age = frame["month"].eq("2025-01") & frame["age_group"].eq("A")
    frame.loc[month_age & frame["minor_code"].eq("learn"), "status"] = "suppressed"
    frame.loc[month_age & frame["minor_code"].eq("language"), "avg_days"] = "0"
    frame.loc[frame["minor_code"].eq("music"), "uu"] = "1"
    source = tmp_path / "clean.csv"
    out = tmp_path / "insights.json"
    frame.to_csv(source, index=False, encoding="utf-8-sig")
    command = [
        sys.executable, "-m", "appbti_pipeline.insights",
        "--input", str(source), "--out", str(out), "--codebook", str(codebook),
    ]
    options = {"capture_output": True, "encoding": "utf-8", "env": {**os.environ, "PYTHONIOENCODING": "utf-8"}}
    done = subprocess.run(command, **options)
    assert done.returncode == 0, done.stderr
    assert done.stderr == ""
    document = json.loads(out.read_text(encoding="utf-8"))
    assert document["is_mock"] is True
    assert document["schema_version"] == 2
    assert document["overview"]["month"] == "2025-06"
    assert len(document["overview"]["top_users"]) <= 5
    insights = document["insights"]
    assert set(insights) == {"generation_map", "frequency_duration", "common_signature", "stability"}
    assert done.stdout.splitlines() == [item["headline"] for item in insights.values()]
    for item in insights.values():
        assert item["chart_data"] and item["method_note"]
        assert "CLR" not in item["headline"]

    chart = insights["generation_map"]["chart_data"]
    matrix = chart["distance_matrix"]
    assert len(matrix) == len(chart["nearest"]) == 6 and len(chart["linkage"]) == 5
    for i, row in enumerate(matrix):
        assert len(row) == 6 and row[i] == 0
        assert all(isclose(distance, matrix[j][i]) for j, distance in enumerate(row))
        nearest = chart["nearest"][i]
        assert nearest["near_tie"] == (nearest["gap_ratio"] < 0.05)

    quadrants = insights["frequency_duration"]["chart_data"]
    lookup = {(row["minor_code"], row["age_group"]): row for row in quadrants["points"]}
    assert "2025-01" not in lookup["learn", "A"]["common_months"]
    assert lookup["language", "A"]["days"] == 0
    assert all(row["minor_code"] != "music" for row in quadrants["top_switching"])
    patterns = insights["common_signature"]["chart_data"]
    assert patterns["baseline"] == 1
    monthly = {(row["month"], row["minor_code"], row["age_group"]): row for row in patterns["monthly_points"]}
    assert monthly and all(code not in {"learn", "language"} for _, code, _ in monthly)
    for code in {code for _, code, _ in monthly}:
        for month in document["months"]:
            for metric in ("days_multiplier", "time_multiplier"):
                assert isclose(prod(monthly[month, code, age][metric] for age in chart["age_order"]), 1)
    for row in patterns["points"]:
        for metric in ("days_multiplier", "time_multiplier"):
            assert isclose(row[metric] ** 6, prod(monthly[month, row["minor_code"], row["age_group"]][metric]
                                                   for month in document["months"]))
    assert all(row["minor_code"] not in {"learn", "language"} for row in patterns["points"])
    assert all(row["minor_code"] != "music" for rows in patterns["signatures"].values() for row in rows)
    assert len(patterns["common"]) == 5
    assert all(row["minor_code"] != "music" for row in patterns["common"])
    for pattern in insights["stability"]["chart_data"]["patterns"]:
        expected = sum(
            (pattern["direction"] == "higher" and row["multiplier"] > 1.2)
            or (pattern["direction"] == "lower" and row["multiplier"] < 0.83)
            for row in pattern["months"]
        )
        assert len(pattern["months"]) == 6 and pattern["matching_months"] == expected

    source.write_text("month,age\n", encoding="utf-8")
    invalid = subprocess.run(command, **options)
    assert invalid.returncode == 2 and invalid.stderr == ""
    assert invalid.stdout.splitlines() == [json.dumps(["month", "age"])]
