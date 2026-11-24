"""가상 집계로 CLI 산식과 출력 범위를 점검한다."""

import json
from math import isclose
import os
from pathlib import Path
import subprocess
import sys

from appbti_pipeline.adapter import load_codebook, read_source


ROOT = Path(__file__).resolve().parents[2]


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
    insights = document["insights"]
    assert set(insights) == {"generation_map", "frequency_duration", "common_signature", "stability"}
    assert done.stdout.splitlines() == [item["headline"] for item in insights.values()]
    for item in insights.values():
        assert item["chart_data"] and item["method_note"]
        assert any(character.isdigit() for character in item["headline"])

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
