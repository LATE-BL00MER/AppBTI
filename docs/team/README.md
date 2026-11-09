# 팀원별 할 일

공통 규칙은 저장소 루트의 `AGENTS.md`에 있다. 이 폴더에는 사람별 할 일만 적는다.

| 이름 | 파일 |
|---|---|
| 신진용 (팀장·백엔드) | [jinyong.md](jinyong.md) |
| 임기범 (백엔드) | [gibeom.md](gibeom.md) |
| 차현우 (데이터) | [hyeonwoo.md](hyeonwoo.md) |
| 우서현 (데이터) | [seohyeon.md](seohyeon.md) |
| 심유진 (프론트) | [yujin.md](yujin.md) |

## AI로 작업 시작하는 법

어떤 AI든 이 저장소를 연 상태(Claude Code, Codex, Cursor 등)라면 아래처럼 말하면 된다. Codex는 `AGENTS.md`를, Claude Code는 `CLAUDE.md`를 통해 같은 지침을 자동으로 읽는다.

```
나는 차현우야. AGENTS.md와 docs/team/hyeonwoo.md를 읽고, 회의 전 작업부터 계획을 세워서 시작해줘.
```

- 리뷰까지 다른 AI에게 맡기고 싶으면 끝에 "모드 B(리뷰 루프)로 해줘"를 붙인다.
- Orca 코디네이터로 쓸 때는 "모드 C 코디네이터로 해줘"를 붙인다.

저장소를 열 수 없는 웹 채팅(ChatGPT, Claude 웹 등)을 쓰면 `AGENTS.md`와 자기 파일을 첨부하고 같은 문장을 보낸다. 실제 CSV가 필요한 작업이면 CSV도 첨부한다. CSV는 외부 서비스에 올리는 것이므로, LG U+ 데이터 사용 조건에 어긋나지 않는지 팀에서 먼저 확인한다.

## 갱신 규칙

- 11/11 회의에서 바뀐 내용은 각자 자기 파일에 반영하고 커밋한다.
- 끝난 항목은 `[x]`로 체크한다.
