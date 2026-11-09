#!/usr/bin/env python3
"""공개 저장소에 실제 데이터가 포함되지 않도록 Git 추적 파일을 검사한다."""

import argparse
import csv
import json
import os
from pathlib import PurePosixPath
import shlex
import subprocess
import sys


MAX_TEXT_BYTES = 1024 * 1024
csv.field_size_limit(MAX_TEXT_BYTES)
DATA_EXTENSIONS = {
    ".csv", ".tsv", ".xlsx", ".xls", ".xlsm", ".parquet",
    ".feather", ".pkl", ".pickle", ".sav", ".dta",
}
SOURCE_COLUMNS = {
    "P_YYYYMM",
    "YY10_AGLV_ID",
    "CNC_INFO_CATG_LVL1_NM",
    "CNC_INFO_CATG_LVL2_NM",
    "UNQ_USER_CNT",
    "AVG_TADV_DAYS",
    "AVG_ASMP_VSIT_TM",
}


def git(*args):
    """Git 오류에도 파일 내용이나 Git의 원문 오류를 출력하지 않는다."""
    result = subprocess.run(
        ["git", *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False
    )
    if result.returncode:
        raise RuntimeError("Git 파일 목록 또는 인덱스 내용을 읽지 못했습니다.")
    return result.stdout


def has_source_header(content):
    # 확장자에 의존하지 않으며, 바이너리와 큰 파일은 본문 검사를 생략한다.
    if len(content) > MAX_TEXT_BYTES or any(
        byte < 32 and byte not in (9, 10, 12, 13) for byte in content
    ):
        return False
    text = content.decode("utf-8-sig", errors="replace")
    for line in text.splitlines()[:5]:
        for delimiter in (",", "\t", ";"):
            fields = next(csv.reader([line], delimiter=delimiter))
            if len(SOURCE_COLUMNS.intersection(field.strip() for field in fields)) >= 3:
                return True
    return False


def inspect_file(path):
    file_path = PurePosixPath(path)
    reasons = []
    if path.startswith(("data/raw/", "data/processed/")):
        # 금지 경로는 실제 원본을 열지 않고 경로만으로 차단한다.
        return ["실제 원본·산출물 전용 경로는 커밋할 수 없습니다."]

    is_mock_name = file_path.name.startswith("mock_")
    if (
        file_path.suffix.lower() in DATA_EXTENSIONS
        and not path.startswith("data/mock/")
        and not is_mock_name
    ):
        reasons.append("데이터 파일입니다. 가상 목업이면 파일 이름에 mock_ 접두어를 붙이세요.")

    # 기본 모드도 인덱스를 사용해 검사 대상과 실제 커밋 내용을 일치시킨다.
    size = int(git("cat-file", "-s", ":" + path))
    is_notebook = file_path.suffix.lower() == ".ipynb"
    if size > MAX_TEXT_BYTES and not is_notebook:
        return reasons
    content = git("show", ":" + path)
    if not is_mock_name and has_source_header(content):
        reasons.append(
            "첫 5줄에 실제 원본 컬럼 3개 이상의 구분자 형식 헤더가 있습니다. "
            "가상 목업이면 파일 이름에 mock_ 접두어를 붙이세요."
        )
    if is_notebook:
        try:
            notebook = json.loads(content)
            cells = notebook["cells"]
            if not isinstance(cells, list) or any(not isinstance(cell, dict) for cell in cells):
                raise ValueError
            if any(cell.get("outputs") for cell in cells):
                reasons.append("노트북 셀 출력이 남아 있습니다. 모든 출력을 지운 뒤 다시 스테이징하세요.")
        except (ValueError, KeyError, TypeError, UnicodeError):
            reasons.append("노트북 형식을 확인할 수 없습니다. 올바른 ipynb로 저장하고 출력을 지우세요.")
    return reasons


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--staged", action="store_true", help="스테이징된 추가·수정 파일만 검사")
    args = parser.parse_args()
    try:
        root = os.fsdecode(git("rev-parse", "--show-toplevel")).rstrip("\r\n")
        os.chdir(root)
        if args.staged:
            paths = git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z")
        else:
            paths = git("ls-files", "-z")
        failed = False
        for raw_path in paths.split(b"\0"):
            if not raw_path:
                continue
            path = os.fsdecode(raw_path)
            reasons = inspect_file(path)
            for reason in reasons:
                print("차단: {!r} — {}".format(path, reason))
            if reasons:
                failed = True
                print("  추적 해제: git rm --cached -- {}".format(shlex.quote(path)))
        if failed:
            print("실제 데이터는 저장소 밖 ~/appbti-data/ 또는 gitignore된 data/raw/real/에 둔다.")
            return 1
    except (OSError, RuntimeError, ValueError):
        # 경로·내용이 섞일 수 있는 외부 예외 메시지는 그대로 출력하지 않는다.
        print("검사 실패: Git과 Python 3.9 이상을 확인한 뒤 다시 실행하세요.", file=sys.stderr)
        return 1
    print("실제 데이터 커밋 검사 통과")
    return 0


if __name__ == "__main__":
    sys.exit(main())
