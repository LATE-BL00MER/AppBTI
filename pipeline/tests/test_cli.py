"""명령행 진입점과 미구현 단계의 산출물 보호를 검증한다."""

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


def test_unimplemented_processing_does_not_create_output(tmp_path) -> None:
    output = tmp_path / "processed"
    result = subprocess.run(
        [sys.executable, "-m", "appbti_pipeline", "--input", str(tmp_path), "--out", str(output)],
        capture_output=True,
    )
    assert result.returncode == 2
    assert not output.exists()
