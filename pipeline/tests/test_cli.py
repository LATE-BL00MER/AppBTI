"""명령행 진입점과 오류 시 오래된 산출물 사용 방지를 검증한다."""

import json
import os
from pathlib import Path
import subprocess
import sys


def test_help() -> None:
    result = subprocess.run(
        [sys.executable, "-m", "appbti_pipeline", "--help"],
        capture_output=True,
    )
    assert result.returncode == 0
    assert b"--input" in result.stdout
    assert b"--out" in result.stdout


def test_invalid_input_writes_report_and_removes_stale_output(tmp_path) -> None:
    output = tmp_path / "processed"
    output.mkdir()
    (output / "profiles.json").write_text("stale", encoding="utf-8")
    result = subprocess.run(
        [sys.executable, "-m", "appbti_pipeline", "--input", str(tmp_path), "--out", str(output)],
        capture_output=True,
    )
    assert result.returncode == 2
    assert not (output / "profiles.json").exists()
    assert (output / "validation_report.json").exists()


def test_site_data_is_built_from_mock_profiles_and_clean_export(tmp_path):
    root = Path(__file__).resolve().parents[2]
    codebook = str(root / "config/codebook.mock.yaml")
    source = root / "data/mock/with_time/mock_usage.csv"
    options = {"capture_output": True, "encoding": "utf-8", "env": {**os.environ, "PYTHONIOENCODING": "utf-8"}}

    prepare = subprocess.run(
        [sys.executable, "-m", "appbti_pipeline", "--input", str(source), "--out", str(tmp_path), "--codebook", codebook],
        **options,
    )
    assert prepare.returncode == 0, prepare.stderr

    generated = subprocess.run(
        [sys.executable, "-m", "appbti_pipeline.site_data", "--input", str(tmp_path / "clean.csv"),
         "--profiles", str(tmp_path / "profiles.json"), "--out", str(tmp_path), "--codebook", codebook],
        **options,
    )
    assert generated.returncode == 0, generated.stderr
    profiles, insights, findings = [
        json.loads((tmp_path / name).read_text(encoding="utf-8"))
        for name in ("profiles.json", "insights.json", "findings.json")
    ]
    assert profiles["surveyReference"]["items"]
    assert insights["is_mock"] and findings["isMock"]
    assert profiles["meta"]["months"] == insights["months"] == findings["months"]
    assert findings["serviceEvidence"]
