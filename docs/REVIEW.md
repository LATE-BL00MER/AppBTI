# 코드 리뷰 기록

## 프로토타입 구현 담당 반영 기록 (2026-10-27)

이번 구현에 대해 Claude를 새로 실행하지 않았다. 아래는 구현 담당의 반영·검증 기록이며 새 리뷰 판정이 아니다.

- R1-1 [반영됨]: 어댑터는 CSV/XLSX만 읽고, 가상 산출물은 Git 제외 경로인 data/processed/mock에 분리했다. API isMock 및 화면 예시 배지를 연결했다.
- R1-2 [반영됨]: 가중 평균 플래그 off, 분모 0, 집단 결측 시 기준일수·상대 빈도는 null이다. 순수 함수 테스트로 검증했다.
- R2-1 [반영 안 함: scripts/review.ps1에는 기존 사용자 수정분이 있으며 이번 구현에서 수정·실행하지 않았다. 자동 리뷰 권한 경로의 재검증은 수행하지 않았다.]
- R2-2 [반영됨]: Python 3.11 가상환경과 저장소 내부 --basetemp를 실행 안내에 명시했다. 샌드박스 임시폴더 거부 후 허용된 환경에서 17개 테스트가 통과했다.

### 구현 담당 검증

- Python 단위 테스트: 17개 통과. 수용 검사, CSV/XLSX, 코드북 매핑, 구성비, 가중 평균, 분모 0, 누락·비공개, 시간 정의·단위, 연속성 구간을 검증했다.
- 백엔드: JUnit 12개 및 bootJar 성공. 공통 항목 제외, 동점, 0일·무응답, 시간 유무, 비교 불가, 입력 오류 및 API 응답을 검증했다.
- 프론트엔드: TypeScript 검사와 프로덕션 빌드 성공. 탐색 차트는 별도 지연 로딩한다.
- 실제 HTTP: scripts/check_demo.py의 26개 확인 통과. 두 가상 버전과 Vite 프록시를 실제 Spring 서버에서 검증했다.
- 브라우저: 소개·예시 결과·직접 설문 제출·시간 문항·응답 유지·데이터 부족·비공개 구성비·탐색 필터를 확인했다. 390px 모바일 화면에서 결과·설문·차트와 페이지 가로 넘침 없음을 확인했다.
- 실제 LG U+ 통계에 대한 모델 성능 검증은 수행하지 않았다. 가상 수치와 시연용 설정이며 실제 연령 구간·분모·유사도 방식은 TODO로 유지한다.

## 라운드 2 — 리뷰 대상: 68245fe..d43a262 (2026-10-27)

### 요약
대상 커밋 2개(`deea772` 리뷰 기록, `d43a262` 자동 리뷰 루프)는 문서와 `scripts/review.ps1`만 바꿨고,
`pipeline/`·`backend/`·`frontend/` 소스나 설정, 데이터 파일 변경은 없다. 그래서 3장 도메인 규칙에 해당하는 변경도 없다.
자동 리뷰 루프는 최대 3라운드로 제한하고, 같은 항목이 연속으로 `[반영 안 함]`→재지적되면 사용자에게 넘기며, 리뷰 권한을 읽기·git·테스트·`docs/REVIEW.md` 쓰기로 좁혔다. 설계가 적절하다.

### 지적 사항
LGTM — 수정 사항 없음 (낮음 2개는 선택 반영)

- **R2-1 [낮음]** `scripts/review.ps1:10-15` — 허용 규칙이 상대 경로·단독 명령 기준이라, 리뷰 중 작업 디렉터리가 바뀌면 권한이 어긋난다.
  - 왜: CLAUDE.md 1장의 테스트 명령은 `cd pipeline && pytest` 형태다. 이번 라운드에서 테스트를 위해 `cd pipeline`를 실행한 뒤,
    `Edit(docs/REVIEW.md)`가 거부됐다. 상대 경로 규칙이 바뀐 작업 디렉터리 기준으로 해석된 것으로 보인다.
    루트로 돌아온 뒤에는 쓰기가 됐다. `cd <dir> && git ...` 형태도 별도 승인을 요구한다.
    비대화식 모드에서는 이런 거부 때문에 REVIEW.md를 쓰지 못하고 루프가 멈출 수 있다.
    Windows에서는 리뷰어가 Bash 대신 PowerShell 도구를 쓸 때도 허용 목록과 맞지 않을 수 있다.
  - 제안: 선택 사항. `Edit`/`Write` 규칙을 저장소 루트 기준 패턴(예: `Edit(/docs/REVIEW.md)` 또는 절대 경로 `//...`)으로 바꾼다.
    또는 프롬프트에 "테스트는 서브셸 `(cd pipeline && pytest)`로 실행하고 작업 디렉터리를 바꾸지 말 것"을 명시한다.
- **R2-2 [낮음]** `pipeline/tests/test_cli.py:18` — 리뷰 환경에서 `tmp_path` 픽스처를 준비하다 `PermissionError`가 발생했다 (테스트 setup ERROR).
  - 왜: 코드 결함이 아니라 환경 문제로 보인다. 리뷰 세션의 기본 `python`은 3.13.9이고, 시스템 임시 폴더 쓰기 권한이 제한돼 있다.
    다만 리뷰 루프에서 매번 같은 ERROR가 나오면 실제 실패와 구분하기 어렵다.
  - 제안: 선택 사항. `pyproject.toml`의 pytest 설정에 저장소 내부 `--basetemp`(예: `.pytest_tmp/`, `.gitignore` 추가)를 지정하는 방안을 검토한다.
    또는 리뷰 시 3.11 가상환경(`uv run pytest` 등)을 쓰도록 문서화한다. 확인 필요: 구현 담당 환경(3.11.15)에서는 2개 모두 통과하는가?

### 이전 라운드 미해결 항목
- R1-1: [반영 안 함] 1단계 경로 준비만 했고, 확장자 제한과 isMock은 3~5단계에서 처리 → 타당. **종결**. 해당 단계 리뷰에서 다시 확인한다.
- R1-2: [반영 안 함] 플래그 off 시 null 처리와 테스트는 3단계에서 하고, 단순 평균 대체는 금지 → 타당. **종결**. 3단계 리뷰에서 필수로 확인한다.
- R1-3: [반영 안 함] AGENTS.md 지정 경로를 제외했고 추적 파일도 확인함 → 낮음 항목이므로 **종결**.

### 테스트 결과
- `cd pipeline && python -m pytest -q` (Python 3.13.9): 1 passed, 1 error.
  `test_unimplemented_processing_does_not_create_output`의 `tmp_path` 생성 단계에서 `PermissionError`가 발생했다. 환경 문제로 판단된다 (R2-2).
- `cd backend && ./gradlew test`: BUILD SUCCESSFUL (up-to-date).
- `cd frontend && npm run build`: 성공 (17 modules, 약 142 kB JS).

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
