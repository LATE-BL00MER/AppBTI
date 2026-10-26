"""파이프라인 명령행 진입점. 데이터 처리는 3단계에서 구현한다."""

import argparse
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="AppBTI 집단 Profile 파이프라인")
    parser.add_argument("--input", type=Path, required=True, help="원본 데이터 폴더")
    parser.add_argument("--out", type=Path, required=True, help="산출물 폴더")
    parser.parse_args()
    parser.exit(2, "데이터 처리는 3단계에서 구현 예정입니다. 산출물을 생성하지 않았습니다.\n")


if __name__ == "__main__":
    main()
