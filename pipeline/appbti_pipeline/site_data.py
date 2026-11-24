"""웹 화면용 인사이트와 분야별 분석을 같은 데이터 버전으로 준비한다."""

from argparse import ArgumentParser
import json
from pathlib import Path

from .adapter import load_codebook
from .analyze_findings import build_findings
from .export import write_json
from .insights import DEFAULT_CODEBOOK, analyze, read_clean


def main():
    parser = ArgumentParser(description="홈·리포트·분야별 분석의 집계 파일을 준비합니다.")
    parser.add_argument("--input", type=Path, required=True, help="clean.csv 경로")
    parser.add_argument("--profiles", type=Path, required=True, help="같은 집계의 profiles.json 경로")
    parser.add_argument("--out", type=Path, required=True, help="웹 분석 산출물 폴더")
    parser.add_argument("--codebook", type=Path, default=DEFAULT_CODEBOOK)
    args = parser.parse_args()
    try:
        book = load_codebook(args.codebook)
        dataset = json.loads(args.profiles.read_text(encoding="utf-8-sig"))
        meta = dataset["meta"]
        months = meta["months"]
        reference = dataset.get("surveyReference")
        if not reference or reference.get("months") != months:
            parser.exit(2, "설문 기준값이 있는 프로필이 필요합니다. 현재 파이프라인으로 profiles.json을 다시 만드세요.\n")
        age_ids = [age["id"] for age in book["age_groups"]]
        if bool(book.get("is_mock")) != meta["isMock"] or age_ids != [age["id"] for age in meta["ageGroups"]]:
            parser.exit(2, "프로필과 코드북의 데이터 버전 또는 연령대가 다릅니다.\n")

        frame = read_clean(args.input, book, months)
        if set(frame["month"]) != set(months) or set(frame["minor_code"]) != {item["code"] for item in meta["minorCategories"]}:
            parser.exit(2, "정제 CSV와 프로필의 집계월 또는 중분류가 다릅니다. 같은 버전의 파일을 지정하세요.\n")

        insights = analyze(frame, book, months)
        findings = build_findings(dataset, book)
        write_json(args.out / "insights.json", insights)
        write_json(args.out / "findings.json", findings)
    except (OSError, ValueError, KeyError, TypeError):
        parser.exit(2, "웹 분석 파일을 만들지 못했습니다. 정제 CSV와 프로필, 코드북을 확인하세요.\n")
    print("웹 분석 파일 준비 완료")


if __name__ == "__main__":
    main()
