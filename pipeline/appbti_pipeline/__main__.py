"""원본 수용 검사 후 표준 profiles.json을 생성한다."""

import argparse
from pathlib import Path

from .adapter import load_codebook, read_source
from .export import write_json
from .profile import build_profiles
from .validate import validate


def main() -> None:
    parser = argparse.ArgumentParser(description="AppBTI 집단 Profile 파이프라인")
    parser.add_argument("--input", type=Path, required=True, help="원본 버전별 CSV/XLSX 폴더")
    parser.add_argument("--out", type=Path, required=True, help="산출물 폴더")
    parser.add_argument("--codebook", type=Path, default=Path(__file__).resolve().parents[2] / "config/codebook.yaml")
    args = parser.parse_args()
    try:
        codebook = load_codebook(args.codebook)
        frame = read_source(args.input, codebook)
        report = validate(frame, codebook)
    except (ValueError, OSError, KeyError) as error:
        report = {"valid": False, "errors": [str(error)], "warnings": [], "rowCount": 0}
    write_json(args.out / "validation_report.json", report)
    if not report["valid"]:
        (args.out / "profiles.json").unlink(missing_ok=True)
        parser.exit(2, "수용 검사 실패. validation_report.json을 확인하세요.\n")
    write_json(args.out / "profiles.json", build_profiles(frame, codebook, report))
    print(f"수용 검사 완료: {report['rowCount']}행, 경고 {len(report['warnings'])}개")


if __name__ == "__main__":
    main()
