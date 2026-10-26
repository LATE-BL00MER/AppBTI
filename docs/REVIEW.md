# 코드 리뷰 기록

## 라운드 1 — 리뷰 대상: a058964..68245fe (2026-10-26)

### 요약
첫 리뷰. AGENTS.md 3장 1단계(뼈대)에 해당하는 커밋으로, 지표 계산·설문·유사도 로직은 아직 없다.
미확정 사항(평균 이용일수 분모, 시간 지표 정의, 유사도 방식·가중치·최소 비교 개수·0일 처리, 분류 기준 변경 월)을
하드코딩하지 않고 `null`/빈 목록과 `TODO(확인 필요)`로 남기고, 관련 플래그(`weighted_reference_days_enabled`,
`daily_time.enabled`, `similarity.enabled`)를 기본 off로 둔 점이 좋다. `data/raw/`·`data/processed/`가 `.gitignore`에
있고 추적 중인 데이터 파일은 `data/mock/.gitkeep`뿐이다. 미구현 CLI가 산출물을 만들지 않음을 테스트로 보장한 것도 좋다.

도메인 규칙(3장) 위반은 없음. 높음·중간 0개.

### 지적 사항
LGTM — 수정 사항 없음 (낮음 3개는 선택 반영)

- **R1-1 [낮음]** `backend/src/main/resources/application.yaml:9` — 목업 산출물 경로가 `data/mock/mock_profiles.json`이다.
  - 왜: AGENTS.md 2장 구조상 `data/mock/`은 "목업 원본" 위치다. 원본 CSV와 파이프라인 산출물이 같은 폴더에 섞이면
    파이프라인 입력 폴더(`--input ../data/mock`)를 읽을 때 산출물 JSON을 원본으로 오인할 여지가 있다.
  - 제안: 2~4단계에서 어댑터가 확장자/파일명 패턴으로 원본만 읽도록 하거나, 목업 산출물을 `data/mock/processed/` 등으로 분리.
    또한 4단계에서 목업으로 대체(fallback)할 때 API 응답에 목업 여부 플래그를 넣어 화면에 "예시 데이터"를 표시할 수 있게 할 것 (3-6, 3-7).
  - [반영 안 함: 현재는 경로만 준비한 1단계다. 원본 확장자 제한은 3단계, 목업 대체와 isMock 표시는 4~5단계 구현 시 검증한다.]
- **R1-2 [낮음]** `config/codebook.yaml:39` — `weighted_reference_days_enabled: false`일 때의 동작이 아직 정의돼 있지 않다.
  - 왜: 3단계 구현 시 플래그가 꺼졌다고 기준일수를 **단순 평균**으로 대체하면 3-1·3-2 위반이 된다.
  - 제안: 3단계에서 플래그 off 시 기준일수·상대 빈도를 `null`로 내보내고, 이를 검증하는 단위 테스트를 함께 추가.
  - [반영 안 함: 계산 로직이 없는 1단계로, 플래그 off 시 null 처리와 테스트는 3단계에서 구현한다. 단순 평균 대체는 허용하지 않는다.]
- **R1-3 [낮음]** `.gitignore:2-3` — 실제 원본 보호가 `data/raw/` 경로에만 의존한다.
  - 왜: 실수로 저장소 루트나 `pipeline/` 아래에 실제 XLSX/CSV를 두면 커밋될 수 있다 (3-7).
  - 제안: 선택 사항. `*.xlsx`를 전역 제외하고 `data/mock/` 하위만 `!` 예외로 허용하는 식의 추가 안전망을 검토.
  - [반영 안 함: AGENTS.md가 지정한 data/raw/와 data/processed/ 전체 제외를 적용했고, 커밋 전 추적 파일도 확인했다. 이번 단계에서는 파일 확장자 전체에 대한 제외 규칙을 추가하지 않는다.]

### 이전 라운드 미해결 항목
없음 (첫 라운드).

### 테스트 결과
- 자동 리뷰 세션의 권한 제한으로 `pytest`, `./gradlew test`, `npm run build`를 **직접 실행하지 못했다** (명령 실행 승인 거부).
- 커밋 메시지상 작성자 보고: pytest 2개 통과, Gradle test 1개 및 bootJar 통과, `npm run build` 통과. 확인 필요 — 다음 라운드에서 재실행 예정.
- 정적 확인: `git ls-files data` 결과 `data/mock/.gitkeep`만 추적됨. 원본·파생 데이터 커밋 없음.

### 구현 담당 검증 기록
- Python 3.11.15: `python -m pytest` 2개 통과, `uv build --wheel pipeline` 성공.
- Java 21 / Gradle 8.14.3: `gradlew.bat test bootJar` 성공, 컨텍스트 테스트 1개 통과.
- Node.js 24 / React 18 / Vite 8: `npm.cmd run build` 성공.
- 실행 확인: Spring Boot JAR의 8080 포트 기동, Vite의 HTML·TSX 변환 응답 HTTP 200.
- 프록시 확인: 직접 및 Vite 경유 `/api/meta` 모두 미구현 API의 HTTP 404 응답. 검증 서버 종료 완료.
- 최종 판정: **VERDICT: LGTM**. 수정한 구현 코드는 없으며 낮음 3개는 위 사유로 미반영.
