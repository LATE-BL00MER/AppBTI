"""명령행 진입점과 오류 시 오래된 산출물 사용 방지를 검증한다."""

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
