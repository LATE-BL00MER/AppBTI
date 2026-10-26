"""집단 지표, 결측, 시간 정의, 어댑터 및 수용 검사에 대한 회귀 검증."""

from copy import deepcopy
from pathlib import Path

import pandas as pd
import pytest

from appbti_pipeline.adapter import load_codebook, read_source
from appbti_pipeline.profile import build_profiles
from appbti_pipeline.validate import validate

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def book():
    return load_codebook(ROOT / "config/codebook.mock.yaml")


@pytest.fixture
def frame(book):
    return read_source(ROOT / "data/mock/basic", book)


def build(frame, book):
    return build_profiles(frame, book, validate(frame, book))


def rows(result, month="2025-06", minor="learn"):
    return [r for r in result["profiles"] if r["month"] == month and r["minorCode"] == minor]


def test_weighted_reference_and_share(frame, book):
    result = rows(build(frame, book))
    assert sum(r["ageShare"] for r in result) == pytest.approx(1, abs=0.00001)
    expected = sum(r["avgDays"] * r["uu"] for r in result) / sum(r["uu"] for r in result)
    assert result[0]["referenceDays"] == pytest.approx(expected, abs=0.00001)
    assert result[0]["relativeFrequency"] == pytest.approx(result[0]["avgDays"] / expected, abs=0.00001)


def test_reference_disabled_is_null(frame, book):
    book["metrics"]["weighted_reference_days_enabled"] = False
    assert all(r["referenceDays"] is None and r["relativeFrequency"] is None for r in build(frame, book)["profiles"])


def test_zero_denominator_is_null(frame, book):
    frame.loc[frame["minor_code"] == "learn", "uu"] = "0"
    assert all(r["ageShare"] is None and r["referenceDays"] is None for r in rows(build(frame, book)))


def test_suppressed_and_missing_age_do_not_become_zero(frame, book):
    result = build(frame, book)
    suppressed = rows(result, minor="news")
    assert all(r["ageShare"] is None and r["referenceDays"] is None for r in suppressed)
    assert suppressed[-1]["avgDays"] is None
    missing = rows(result, "2025-03", "travel")
    assert missing[2]["status"] == "missing" and missing[2]["avgDays"] is None
    assert all(r["ageShare"] is None for r in missing)


def test_time_is_optional_and_units_are_converted(frame, book):
    assert build(frame, book)["meta"]["metrics"]["dailyTime"] is False
    timed = read_source(ROOT / "data/mock/with_time", book)
    original = float(timed.loc[0, "avg_daily_time"])
    timed.loc[0, "time_unit"] = "秒未定義"
    assert validate(timed, book)["warnings"]
    assert build(timed, book)["profiles"][0]["avgDailyTime"] is None
    timed.loc[0, "time_unit"] = "초"
    assert build(timed, book)["profiles"][0]["avgDailyTime"] == pytest.approx(original / 60, abs=0.00001)
    book["metrics"]["daily_time"]["denominator"] = None
    assert build(timed, book)["meta"]["metrics"]["dailyTime"] is False


def test_continuity_breaks_split_segments(frame, book):
    book["continuity_breaks"] = ["2025-04"]
    result = build(frame, book)
    assert rows(result, "2025-03")[0]["segment"] == 0
    assert rows(result, "2025-04")[0]["segment"] == 1


@pytest.mark.parametrize("field,value", [("avg_days", "32"), ("uu", "-1"), ("uu", "NaN"), ("month", "2025-13"), ("age_group", "unknown"), ("minor_code", "unknown")])
def test_invalid_values_are_fatal(frame, book, field, value):
    frame.loc[0, field] = value
    assert not validate(frame, book)["valid"]


def test_duplicate_is_fatal(frame, book):
    assert not validate(pd.concat([frame, frame.iloc[:1]], ignore_index=True), book)["valid"]


def test_xlsx_and_name_mapping_without_codes(frame, book, tmp_path):
    renamed = deepcopy(book)
    renamed["columns"]["別の基準月"] = renamed["columns"].pop("기준월")
    source = pd.read_csv(ROOT / "data/mock/basic/mock_usage.csv", encoding="utf-8-sig")
    source = source.drop(columns="중분류 코드").rename(columns={"기준월": "別の基準月"})
    source.to_excel(tmp_path / "mock_test.xlsx", index=False)
    loaded = read_source(tmp_path, renamed)
    assert loaded["minor_code"].tolist() == frame["minor_code"].tolist()
    assert validate(loaded, renamed)["valid"]


def test_missing_required_column_is_fatal(book, tmp_path):
    (tmp_path / "mock_bad.csv").write_text("기준월\n2025-01\n", encoding="utf-8")
    with pytest.raises(ValueError, match="필수 컬럼"):
        read_source(tmp_path, book)
