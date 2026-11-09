# CLAUDE.md — Claude Code 진입점

이 저장소의 공통 지침은 모두 `AGENTS.md`에 있다. 아래 줄로 불러온다.

@AGENTS.md

(위 내용이 자동으로 불러와지지 않았다면, 작업 전에 저장소 루트의 `AGENTS.md`를 직접 읽는다.)

## Claude Code 추가 메모

- 역할은 `AGENTS.md` 0-1장의 **작업 모드**가 정한다. 사용자가 모드를 말하지 않으면 모드 A(단독: 구현 + 자기 점검)다.
- 예전의 "Claude는 리뷰만 한다(코드 수정 금지)" 규칙은 **폐지**됐다. Claude만 쓰는 팀원도 이 저장소에서 바로 구현할 수 있다.
- 리뷰 담당으로 요청받았거나 `scripts/review.ps1`로 호출된 경우에만 `docs/REVIEW_GUIDE.md`의 절차를 따른다. 이때는 `docs/REVIEW.md` 외의 파일을 수정하지 않는다.
