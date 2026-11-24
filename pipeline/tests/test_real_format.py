"""실제 제공 형식(상태·코드 컬럼 없음, YYYYMM)의 동작을 합성 값으로 검증한다."""

import json
import re
import subprocess
import sys
from pathlib import Path

import pandas as pd
import pytest

from appbti_pipeline.adapter import load_codebook, read_source
from appbti_pipeline.profile import build_profiles
from appbti_pipeline.validate import validate

ROOT = Path(__file__).resolve().parents[2]
BASE = {"P_YYYYMM": "202501", "YY10_AGLV_ID": "20대", "CNC_INFO_CATG_LVL1_NM": "엔터테인먼트",
        "CNC_INFO_CATG_LVL2_NM": "OTT", "UNQ_USER_CNT": "100", "AVG_TADV_DAYS": "3.5", "AVG_ASMP_VSIT_TM": "1.5"}
SAFETY = {"CNC_INFO_CATG_LVL1_NM": "뉴스/정보", "CNC_INFO_CATG_LVL2_NM": "안전민감", "UNQ_USER_CNT": "0", "AVG_TADV_DAYS": ""}


@pytest.fixture
def book():
    return load_codebook(ROOT / "config/codebook.yaml")


def write(folder, *rows):
    pd.DataFrame([{**BASE, **row} for row in rows]).to_csv(folder / "usage.csv", index=False, encoding="utf-8-sig")


def load(folder, book, *rows):
    write(folder, *rows)
    return read_source(folder, book)


def test_codebook_shape(book):
    minors = book["minor_categories"]
    assert len(book["age_groups"]) == 6 and len(book["major_categories"]) == 14 and len(minors) == 105
    assert len({c["code"] for c in minors}) == 105 and len({c["name"] for c in minors}) == 105
    assert all(re.fullmatch(r"[a-z][a-z0-9_]*", c["code"]) for c in minors)
    assert {c["major"] for c in minors} == set(book["major_categories"])
    assert set(book["exclude_minor_names"]) <= {c["name"] for c in minors}


def test_source_format_is_mapped(tmp_path, book):
    frame = load(tmp_path, book, {})
    row = frame.iloc[0]
    assert (row["month"], row["age_group"], row["minor_code"], row["status"]) == ("2025-01", "20s", "ott", "normal")
    assert validate(frame, book)["valid"]


def test_status_is_derived_without_filling_zero(tmp_path, book):
    frame = load(tmp_path, book, {}, {"CNC_INFO_CATG_LVL2_NM": "게임", "UNQ_USER_CNT": "0"},
                 {"CNC_INFO_CATG_LVL2_NM": "영화", "AVG_TADV_DAYS": ""})
    assert frame["status"].tolist() == ["normal", "suppressed", "missing"]
    report = validate(frame, book)
    assert report["statusCounts"] == {"normal": 1, "suppressed": 1, "missing": 1}
    result = build_profiles(frame, book, report)
    for code in ("game", "movie"):
        row = next(r for r in result["profiles"] if r["minorCode"] == code and r["ageGroup"] == "20s" and r["month"] == "2025-01")
        assert row["uu"] is None and row["avgDays"] is None


def test_excluded_minor_is_dropped_and_reported(tmp_path, book):
    frame = load(tmp_path, book, {}, SAFETY)
    assert frame["minor_name"].tolist() == ["OTT"]
    excluded = validate(frame, book)["excluded"]
    assert [e["minorName"] for e in excluded] == ["안전민감"]
    assert excluded[0]["rows"] == 1 and excluded[0]["uuZeroRows"] == 1 and excluded[0]["blankRows"] == 1
    assert len(excluded[0]["missingCombos"]) == 35
    assert {"month": "2025-01", "ageGroup": "20s"} not in excluded[0]["missingCombos"]


def test_time_without_unit_column_is_read_as_declared_minutes(tmp_path, book):
    frame = load(tmp_path, book, {})
    assert frame.loc[0, "avg_daily_time"] == "1.5" and frame.loc[0, "time_unit"] == "minutes"
    report = validate(frame, book)
    assert not [w for w in report["warnings"] if "시간 단위" in w]
    result = build_profiles(frame, book, report)
    assert result["meta"]["metrics"]["dailyTime"] is True
    row = next(r for r in result["profiles"] if r["minorCode"] == "ott" and r["ageGroup"] == "20s" and r["month"] == "2025-01")
    assert row["avgDailyTime"] == pytest.approx(1.5)


def test_unknown_minor_is_fatal(tmp_path, book):
    assert not validate(load(tmp_path, book, {"CNC_INFO_CATG_LVL2_NM": "없는 분류"}), book)["valid"]


def test_cli_writes_clean_csv_and_report(tmp_path):
    source, output = tmp_path / "raw", tmp_path / "out"
    source.mkdir()
    write(source, {}, SAFETY)
    command = [sys.executable, "-m", "appbti_pipeline", "--input", str(source), "--out", str(output),
               "--codebook", str(ROOT / "config/codebook.yaml")]
    assert subprocess.run(command, cwd=ROOT / "pipeline", capture_output=True).returncode == 0
    clean = pd.read_csv(output / "clean.csv", encoding="utf-8-sig")
    assert clean["minor_code"].tolist() == ["ott"] and clean.loc[0, "age_label"] == "20대"
    codes = pd.read_csv(output / "minor_codes.csv", encoding="utf-8-sig")
    assert len(codes) == 105 and codes.loc[codes["excluded"], "name"].tolist() == ["안전민감"]
    report = json.loads((output / "validation_report.json").read_text(encoding="utf-8"))
    assert report["excluded"][0]["minorName"] == "안전민감"
