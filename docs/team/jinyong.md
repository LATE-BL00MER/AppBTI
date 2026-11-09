# 신진용 (팀장 · 백엔드) — 설문·결과 API, 통합·시연

> 공통 규칙은 `AGENTS.md`. 이 파일은 내 할 일만 적는다.

## 목표
11/18 중간발표에서 "설문 → 결과 → 세대별 탐색"이 실제 데이터로 끊김 없이 시연되게 한다. 11/11 회의를 진행해 미정 항목을 모두 확정한다.

## 회의 전 (11/10까지, 단톡 공유)
- [x] AGENTS.md·CLAUDE.md 공통 지침 정리 (어떤 AI로도 작업 가능한 구조), docs/team 추가
- [ ] 위 지침 커밋 후 팀원에게 공지 ("나는 ○○야. AGENTS.md와 docs/team/○○.md 읽고 시작해줘")
- [ ] 저장소 메모: 개인 레포(LATE-BL00MER/AppBTI)를 팀 레포(hansung-sw-capstone-2026-2/team_UplusTOPIA)로 옮길지 장단점, 브랜치 규칙 초안
- [ ] `/api/survey/result` 확장 응답 JSON 초안 → `docs/API.md` 갱신 + `docs/examples/survey_result.json`
  - 6개 연령대 전체 유사도 순위 (점수, 순위)
  - 닮은 중분류 3개, 다른 중분류 3개 (내 응답 vs 집단 값)
  - 레이더용 대분류 점수 (산식은 우서현이 정함, 확정 전에는 null 허용)
  - 유형 이름·한 줄 설명 (우서현 제공, 확정 전에는 placeholder)
- [ ] 11/11 회의 진행표: 안건 8개(AGENTS.md 2장)별 준비자, 결정할 것, 시간 배분 (총 3시간)

## 회의 후
- [ ] 11/12 우서현 확정안(`config/survey_questions.yaml`, `config/similarity.yaml`) 적용 → `/api/survey/questions`, `/api/survey/result` 실제 데이터로 동작, `SimilarityCalculator`·`SimilaritySettings` 테스트 갱신
- [ ] 11/12 노션 'API 명세서'용 마크다운 (`docs/API.md` 기준, 엔드포인트별 요청·응답 예시·오류 코드)
- [ ] 11/13 주차 보고서 18시 제출
- [ ] 11/13~15 실행 스크립트(macOS·Windows) 실제 데이터 버전으로 갱신, 통합 테스트 체크리스트
- [ ] 11/16 전체 흐름 테스트, **기능 동결**
- [ ] 11/17 3분 시연 시나리오 (클릭 순서, 말할 내용, 실패 시 대처), 백업 영상 녹화

## 받는 것 / 주는 것
- 받음: 우서현 → 문항·유사도 확정안 (11/11), 대분류 점수 산식 (11/12)
- 줌: 전원 → 결과 API 초안 (11/10), 심유진 → 실제 API (11/12)

## 완료 기준
- 실제 데이터로 `./gradlew test` 통과, 설문 제출 시 6개 연령대 순위와 근거가 나온다
- 공통 항목이 부족하면 `status=insufficient`로 안내된다 (500 오류 없음)

## Orca로 작업할 때 (모드 C)
- 코디네이터(main 작업 트리): "나는 신진용이야. 모드 C 코디네이터로, AGENTS.md와 docs/team/jinyong.md를 읽고 Run과 태스크 계획을 세워줘. 작업자는 Codex, 시작 전에 내 승인을 받아."
- 실제 데이터는 `~/appbti-data/`에 두고, Orca 설정 스크립트로 새 작업 트리의 `data/`에 복사한다.
