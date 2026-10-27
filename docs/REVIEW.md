# 코드 리뷰 기록

## 라운드 5 — 리뷰 대상: d64a01a..483b76f (2026-10-27)

### 요약
R4 기록(eabcddd), 통합 머지(c066155), 프론트 화면 개편(483b76f)을 리뷰했다. 코드 변경은 `frontend/`와 `docs/UI_DESIGN.md`, 로컬 글꼴뿐이며 pipeline·backend 계산 로직은 바뀌지 않았다.
3장 도메인 규칙 위반은 없다.
- 소개 미리보기는 분야마다 첫 중분류 하나의 값만 보여주고 중분류 간 합산·평균을 하지 않는다(3-2). 막대 길이는 `avgDays / 기준월 일수`로 그린다. 이용률로 표기하지 않고 단위를 "일 / 월"로 적었다.
- `/profiles`가 month 없이 호출되면 최신월만 내려준다(`ApiController.java:39-40`). 미리보기에 붙인 `monthLabel(month)` 라벨과 데이터 기준월이 일치한다.
- 결측은 `formatNumber(value ?? null)`을 거쳐 "데이터 없음"으로, 로딩 중은 "불러오는 중"으로 표시한다. 0으로 채우지 않는다(3-4). 미리보기 API 오류도 이제 `ErrorNotice`로 드러난다.
- 결과 제목은 "내 응답과 닮은 패턴"과 집단 라벨로 나뉘었다. 연령 판정 표현은 없다. 유사도 아래 "확률이나 정확도를 의미하지 않아요" 문구와 예시 데이터 배지, 출처(`Source`)도 유지된다(3-6).
- 모바일 메뉴 토글(`aria-expanded`/`aria-controls`), 설문 분야·탐색 중분류 드롭다운, 600px 이하 레이아웃이 추가됐다. `eyebrow` → `context-label` 치환은 남은 참조 없이 끝났다.

중간 1개: 월별 추이 선 차트의 점 표시 제거로 고립된 월의 값이 차트에서 사라진다.

### 지적 사항
- **R5-1 [중간]** `frontend/src/pages/Explore.tsx:50` — 추이 `Line`이 `dot={false}`와 `connectNulls={false}`를 함께 쓴다. 이 조합에서는 앞뒤가 비어 있는 한 달짜리 값이 차트에 전혀 그려지지 않는다.
  - 왜 문제인가: 시리즈는 `ageGroup_segment` 단위로 나뉜다. `continuity_breaks`에 경계가 들어가면(`pipeline/appbti_pipeline/profile.py:50`) 경계 이후 구간이 한 달뿐일 수 있다. 예를 들어 경계가 `2025-06`이면 6월 시리즈는 점 하나다. 앞뒤 달이 결측(비공개·누락)인 달의 값도 같은 이유로 보이지 않는다. 제공된 통계가 차트에서 조용히 빠지고, 화면에는 "값이 없거나 집계 기준이 바뀐 달은 선을 연결하지 않습니다"라는 안내만 남는다. 사용자는 이 값을 결측으로 오해할 수 있다(3-1 월별 연속성 분리, 3-4 결측과 값의 구분). 수치는 접힌 `details` 표에만 남는다. 현재 목업은 경계가 없고 결측도 양옆이 이어지는 3월·6월이라 재현되지 않는다. 실제 코드북에 경계가 생기면 바로 드러난다. 이전 코드(`dot={{ r: 3 }}`)에서는 보였으므로 이번 커밋의 회귀다.
  - 수정 제안: 점을 다시 켠다(`dot={{ r: 2 }}`). 선 패턴만 쓰는 디자인을 유지하려면 앞뒤 값이 모두 `null`인 점만 그리는 커스텀 `dot` 렌더러를 쓴다. 최소한 시리즈의 유효 포인트가 1개뿐일 때는 점을 표시해야 한다. 회귀 방지용으로 `UI_DESIGN.md` 시각 점검 항목에 "단일 월 구간 표시"를 추가한다.
  - [반영됨]: 반지름 2px의 점을 복원하고, 결측·집계 기준 변경 구간의 선 미연결을 유지한다. 브라우저에서 1440·768·390px의 단일 월 구간과 앞뒤 결측 월, 선 미연결, 범례 패턴을 검사해 12개 회귀 확인이 통과했다.
- **R5-2 [낮음]** `frontend/index.html:7`, `frontend/public/fonts/PretendardVariable.woff2` — 전체 글리프 가변 글꼴(약 2.0MB)을 모든 페이지에서 `preload`한다.
  - 왜: 모바일 가독성 개선이 목표인데, 첫 화면 진입 시 2MB를 우선순위 높게 받아 모바일 망에서 첫 렌더가 늦어질 수 있다. `font-display: swap`이라 동작은 깨지지 않는다.
  - 제안: Pretendard가 배포하는 KS X 1001 서브셋(가변) woff2로 바꾸거나 `preload`를 제거한다. 발표장 오프라인 시연이 목적이면 현재 방식도 문제없다. 선택 반영.
  - [반영됨]: preload를 제거했다. 한국어 글꼴의 전체 문자 지원과 로컬 배포는 유지하고, `font-display: swap`으로 글꼴 다운로드 중에도 본문을 읽게 한다.
- **R5-3 [낮음]** `frontend/src/pages/Explore.tsx:11` — 추이 선 색 6개가 모두 청회색 계열이다(`#667783`, `#505c68`, `#303b46` 등). 집단 구분이 대시 패턴에 크게 의존한다. 점선 `2 3`과 `3 3`은 260px 높이 차트에서 구분이 어렵다.
  - 제안: 패턴 간 차이를 키우거나(`2 3` ↔ `12 4` 등) 툴팁·범례 외에 선 끝 라벨을 둔다. 선택 반영.
  - [반영됨]: 실선·긴 대시·짧은 점선·일점쇄선·더 긴 대시·세 짧은 점 묶음으로 구분하고, 범례와 실제 선이 같은 패턴 설정을 사용한다.

### 이전 라운드 미해결 항목
- R4-1: [반영 안 함] 가중치 키·`minimum_categories`의 코드북 교차검증을 실제 설정 활성화 단계로 미룸 → 현재 목업 설정(`weights: {}`, 최소 4/12)에서는 결과에 영향이 없고 낮음 항목이다. **종결**. 실제 코드북·`similarity.yaml` 활성화 라운드에서 다시 확인한다.
- R4-2: [반영 안 함] `/api/meta`의 `zeroDaysPolicy: null` 명시 검증을 후속으로 미룸 → 프론트가 키 누락과 null을 같은 미확정 문구로 처리하므로 동작 위험이 없다. **종결**.

### 테스트 결과
`scripts/review.ps1`이 미리 실행한 결과를 옮긴다(리뷰어는 직접 실행하지 않음).
- pipeline `.venv\Scripts\python.exe -m pytest -q`: **PASSED** — 17 passed (10.88s). `.pytest_cache` 쓰기 권한 경고 1건(`WinError 5`)은 테스트 결과와 무관하다.
- backend `gradlew.bat test --console=plain`: **PASSED** — BUILD SUCCESSFUL. 이번 범위에 backend 변경이 없어 `:test`가 UP-TO-DATE였다.
- frontend `npm.cmd run build`: **PASSED** — `tsc --noEmit`와 vite 빌드 성공(603 modules, Explore 청크 382KB).
- 프론트에는 자동 UI 테스트가 없다. R5-1은 코드 검토와 `profile.py`의 segment 생성 규칙으로 확인했다.

## 라운드 4 — 리뷰 대상: 13bd400..d64a01a (2026-10-27)

### 요약
R3 낮음 항목을 반영한 커밋 1개(d64a01a)를 리뷰했다. 도메인 규칙(3장) 위반은 없다.
- 설정 검증: 활성 설정은 record의 compact 생성자에서 검증한다. Loader가 `RuntimeException`을 파일 경로가 포함된 `IOException`으로 감싸 기동을 중단하므로, 설정 오류가 더 이상 400(사용자 입력 오류)으로 내려가지 않는다.
  계산기에서 빠진 검증(방식·정책·가중치)은 모두 생성자로 옮겨졌다. 비활성 설정은 계산 전에 `unavailable`로 반환되므로 검증하지 않은 값이 계산에 쓰이지 않는다.
- 빈 `weights:`, 빈 YAML, `null`·음수·`.inf` 가중치, `minimum_categories` 누락·0을 테스트로 확인했다.
- 0일 정책 문구: `zeroDaysPolicy`가 meta·questions에 내려가고, Survey와 AboutData가 exclude·include·미확정(null) 세 경우로 분기한다. 무응답은 정책과 관계없이 제외된다고 안내한다(3-3).
- `include` 정책에서도 사용자 값과 집단 값의 차이를 `Math.min(1, …)`로 자르므로, 0일이 집단 범위 밖이어도 점수가 0~100 밖으로 나가지 않는다.
- 결과 제목은 "내 응답 패턴은 ○○ 통계와 가장 닮았어요"로 바뀌었다. 조사 문제가 없어졌고, 개인 기록 분석으로 읽힐 여지도 줄었다(3-6).

높음·중간은 없다.

### 지적 사항
LGTM — 수정 사항 없음 (낮음 2개는 선택 반영)

- **R4-1 [낮음]** `backend/src/main/java/kr/ac/hansung/appbti/similarity/SimilaritySettings.java:21-33` — 활성 설정 검증이 코드북과 대조하지 않는다.
  - 왜: (1) `weights`의 키가 코드북에 없는 중분류 코드(오타 등)여도 통과한다. 그러면 계산기 `getOrDefault(code, 1.0)`가 해당 중분류에 기본 가중치 1.0을 조용히 적용한다. (2) `minimum_categories`가 전체 중분류 수보다 커도 통과한다. 이 경우 모든 요청이 항상 "비교 불가"가 된다. 실제 설정을 채울 때 생기기 쉬운 실수인데 오류 없이 결과만 달라진다(3-7 교체 가능성). 현재 목업 설정은 `weights: {}`, `minimum_categories: 4`라서 영향이 없다.
  - 제안: 설정과 Profile 메타가 모두 적재된 뒤 한 번 검사한다(예: Repository 적재 후 `@PostConstruct` 또는 별도 검증 Bean). 모르는 가중치 키와 `minimum_categories > minorCategories.size()`를 기동 오류나 최소한 경고 로그로 알린다.
  - [반영 안 함: 현재 목업은 빈 가중치와 최소 4개/전체 12개로 유효하며 동작 영향이 없다. 실제 코드북과 비교 설정을 활성화하는 단계에서 분류 코드·개수 교차검증을 보강하는 후속 항목으로 남긴다.]
- **R4-2 [낮음]** `backend/src/test/java/kr/ac/hansung/appbti/profile/ApiControllerTests.java:147-148` — 비활성 설정의 `zeroDaysPolicy: null`은 `/api/survey/questions`에서만 검증하고 `/api/meta`에서는 검증하지 않는다. 또 `jsonPath(...).isEmpty()`는 키가 `null`인 경우와 빈 문자열을 구분하지 않는다.
  - 제안: `/api/meta`도 같은 단언에 넣는다. 키 존재와 null 값을 함께 확인하려면 `jsonPath("$.zeroDaysPolicy").value(org.hamcrest.Matchers.nullValue())`를 쓴다. 프론트는 키가 없어도(undefined) 미확정 문구로 떨어지므로 동작에는 문제가 없다.
  - [반영 안 함: 현재 exclude·include 정책은 두 API에서 검증되고, 미확정 설정은 comparisons 비활성 상태로 안전하게 안내된다. 이번 LGTM 라운드는 종료하고 meta의 명시적 null 검증 강화는 후속 테스트 보강 항목으로 남긴다.]

### 구현 담당 최종 확인

- 이번 작업에서 Claude 리뷰를 2회(라운드 3·4) 받았고 최종 판정은 VERDICT: LGTM이다.
- R3-1·4·5·6은 반영 후 재확인됐고, R3-2·3의 실제 형식 확인 보류는 리뷰어가 타당하다고 종결했다.
- Python 17개, 백엔드 JUnit 17개 테스트 및 프론트 빌드가 통과했다. HTTP 검증 26개와 브라우저의 변경 문구도 확인했다.
- R4-1·2는 낮음 선택 항목으로 위 사유를 기록했다. 기존 사용자 수정분인 scripts/review.ps1은 변경하거나 커밋하지 않았다.

### 이전 라운드 미해결 항목
- R3-1: [반영됨] 확인 완료. 빈 가중치 정규화, 적재 시 검증, 설정 오류 시 기동 중단이 테스트와 함께 구현됐다. **종결**.
- R3-2: [반영 안 함] 시간 단위 열이 누락되면 시간 지표를 끄는 보수적 처리 유지 → 값이 틀리지 않고 안전하게 꺼지는 방향이다. 실제 코드북 수령 전에 보충 규칙을 추정하지 않겠다는 판단도 AGENTS.md의 "미확정 사항 임의 확정 금지"와 맞는다. **종결**. 실제 데이터 교체 라운드에서 단위 위치를 다시 확인한다.
- R3-3: [반영 안 함] 기준월 `YYYY-MM` 엄격 검사 유지 → 형식이 다르면 수용 검사에서 멈추고 잘못된 계산으로 이어지지 않는다. 사유가 타당하다. **종결**. 실제 XLSX 수령 시 날짜 셀 여부를 확인해야 한다.
- R3-4: [반영됨] 세 정책 상태별 문구와 API 테스트를 확인했다. **종결**.
- R3-5: [반영됨] 제목 문구 변경을 확인했다. **종결**.
- R3-6: [반영됨] 작업 트리에 잘못 생성된 임시 폴더가 없다(`git status --ignored` 확인). 남은 변경은 사용자 수정분인 `scripts/review.ps1`뿐이다. **종결**.

### 테스트 결과
`scripts/review.ps1`이 미리 실행한 결과를 옮긴다(리뷰어는 직접 실행하지 않음).
- pipeline `.venv\Scripts\python.exe -m pytest -q`: **PASSED** — 17 passed (4.10s)
- backend `gradlew.bat test --console=plain`: **PASSED** — BUILD SUCCESSFUL. `:test`가 UP-TO-DATE였다. 이번 커밋에서 바뀐 테스트 소스(`SimilaritySettingsTests`, `ApiControllerTests`)를 포함한 성공 결과가 이미 캐시돼 있었다는 뜻이다.
- frontend `npm.cmd run build`: **PASSED** — `tsc --noEmit`와 vite 빌드 성공(603 modules)

## 라운드 3 — 리뷰 대상: d43a262..13bd400 (2026-10-27)

### 요약
목업 데이터, 수용 검사, Profile 계산(pipeline), 조회·설정 기반 유사도 API(backend), 설문·결과·탐색 화면(frontend)을 한 번에 구현한 7개 커밋을 리뷰했다.
3장 도메인 규칙은 모두 지켜졌다.
- 산식: 구성비, UU 가중 기준일수, 상대 빈도가 AGENTS.md 5장과 일치한다. 연령 하나라도 결측이거나 분모가 0이면 `null`이고, 가중 평균은 플래그와 분모가 `users`일 때만 계산한다.
- 0 대체 없음: `fillna(0)`, `?? 0`, `|| 0`이 없다. 두 `getOrDefault`는 빈 Map과 가중치 기본값 1.0이라 결측을 0으로 바꾸지 않는다.
- 금지 연산 없음: 중분류 간 UU 합산, 이용률 표현, 시간 환산, 연령 재분류가 없다.
- 설정 분리: 실제 설정(`similarity.yaml`)은 `enabled: false`이고, 미확정 방식은 목업 설정에만 적용된다.

잘된 점: 결정적 정렬과 동점 공동 표시, 공통 항목만 쓰는 min-max 정규화, 무응답과 0일 구분, 시간 지표 조건부 off,
예시 데이터 배지, 출처 표시, 연속성 구간 분리가 구현됐고 테스트로 검증됐다.
높음·중간은 없다. 아래는 실제 데이터 교체와 설정 실수에 대비한 낮음 항목이다.

### 지적 사항
LGTM — 수정 사항 없음 (낮음 6개는 선택 반영)

- **R3-1 [낮음]** `backend/src/main/java/kr/ac/hansung/appbti/similarity/SimilarityCalculator.java:74` — `similarity.yaml`에서 `weights:`를 빈 값으로 두면 `settings.weights()`가 `null`이 되어 NPE(500)가 난다.
  - 왜: 실제 설정을 채울 때 흔히 생기는 실수다. 또 `method` 같은 설정 오류가 `IllegalArgumentException`으로 처리돼 **400(사용자 입력 오류)** 으로 내려간다. 설정 오류와 입력 오류를 구분할 수 없다.
  - 제안: `Loader.read`에서 `weights == null`이면 빈 Map으로 정규화한다. `enabled: true`일 때 지원 방식을 기동 시점에 검증해 잘못된 설정이면 기동을 실패시킨다.
  - [반영됨]: 빈 가중치를 빈 Map으로 정규화하고, 활성 설정의 방식·최소 항목·정책·가중치를 적재 시 검증한다. 설정 오류는 파일 경로가 포함된 IOException으로 기동을 중단한다. 비활성 실제 설정의 미확정 값은 유지한다.
- **R3-2 [낮음, 확인 필요]** `pipeline/appbti_pipeline/profile.py:16-17` — 코드북의 `source_unit`은 시간 지표를 켤지 판단할 때만 쓰고, 환산에는 행별 `time_unit`만 쓴다.
  - 왜: 실제 원본에 `시간 단위` 컬럼이 없고 단위가 코드북에만 정의돼 있으면, 시간 지표가 전부 `null`로 꺼진다. 행 단위 경고도 모든 행에서 나온다. 반대로 행 단위와 코드북 단위가 다를 때의 불일치 검사도 없다. 값이 틀리지는 않고 안전하게 꺼지는 방향이라 낮음으로 둔다.
  - 제안: 행 단위가 비어 있으면 코드북 `source_unit`으로 보충한다. 둘 다 있는데 서로 다르면 경고한다. 실제 코드북 수령 후 단위가 어디에 오는지 확인 필요.
  - [반영 안 함: 현재 요청 형식의 시간 단위 열이 누락되면 경고하고 시간 지표를 끄는 보수적 처리를 유지한다. 행별 단위와 코드북 단위가 다른 경우에도 명시된 행별 단위를 정확히 분으로 환산한다. 실제 원본에서 단위가 코드북에만 오는지 확인한 뒤 보충 규칙을 결정한다.]
- **R3-3 [낮음, 확인 필요]** `pipeline/appbti_pipeline/adapter.py:34` — XLSX를 `dtype=str`로 읽어서, 기준월이 날짜 셀이면 `"2025-01-01 00:00:00"`이 된다. 그러면 `validate.py:21`에서 전 행이 "기준월 형식 오류"로 막힌다.
  - 왜: 실제 데이터가 XLSX이고 기준월이 날짜 서식이면, 코드북 수정만으로 대응할 수 없다(3-7 교체 가능성). 오류로 멈추는 방향이라 계산이 틀리지는 않는다.
  - 제안: 어댑터에서 기준월 컬럼만 `YYYY-MM`으로 정규화한다(날짜·`YYYYMM`·`YYYY.MM` 허용). 날짜 셀 기준월 케이스의 XLSX 테스트를 추가한다.
  - [반영 안 함: 현재 희망 제공 규격인 YYYY-MM을 엄격하게 검사한다. 실제 원본의 날짜 셀·별도 월 표기를 확인하지 않은 상태에서 허용 형식을 추정해 넓히지 않는다. 실제 코드북 수령 후 Python 어댑터와 해당 형식의 테스트로 대응한다.]
- **R3-4 [낮음]** `frontend/src/pages/Survey.tsx:44` — "이용자 기준 평균과 직접 비교할 수 없는 0일 응답은 제외" 문구가 `zero_days_policy`와 관계없이 고정돼 있다.
  - 왜: 설정을 `include`로 바꾸면 화면 설명이 실제 계산과 달라진다(3-6 비교 제한 안내의 정확성).
  - 제안: `/api/survey/questions`에 `zeroDaysPolicy`를 내려 문구를 분기한다.
  - [반영됨]: meta와 survey/questions에서 zeroDaysPolicy를 제공한다. 설문과 데이터 안내는 exclude·include·미확정 상태에 맞춰 안내한다. 두 정책 및 비활성 설정의 null 응답을 API 테스트로 검증한다.
- **R3-5 [낮음]** `frontend/src/pages/Result.tsx:47` — 결과 문장이 `{matchLabels}과 가장 닮았어요`로 조사가 고정돼 있다.
  - 왜: 목업 라벨("A집단")에서는 맞지만, 실제 라벨이 "20대"처럼 받침 없는 말로 끝나면 "20대과"가 된다.
    또 "나의 디지털 습관은 ○○과 닮았어요"는 개인 기록 분석처럼 읽힐 여지가 있다(3-6). 바로 아래 문장("응답 패턴이 … 통계와 가장 비슷합니다")이 이를 보완하고 있다.
  - 제안: 조사 처리(와/과)를 하거나 "○○ 통계와 가장 닮았어요"처럼 조사 문제가 없는 문장으로 바꾼다. 헤드라인에도 "응답 패턴"을 넣는 방안을 검토한다.
  - [반영됨]: 결과 제목을 "내 응답 패턴은 ○○ 통계와 가장 닮았어요"로 바꿔 집단명에 따른 조사 문제와 개인 기록 분석으로 읽힐 여지를 줄였다.
- **R3-6 [낮음]** 작업 트리 — 추적되지 않은 `pipeline/HSU_Corporate_Capstone_Project.cachereview-pytest/`가 생겼다. pytest `--basetemp` 경로가 구분자 없이 이어 붙은 것으로 보인다.
  - 왜: `.gitignore`에 없어서 `git add .` 한 번이면 테스트 임시 산출물이 커밋될 수 있다(3-7). 원인은 커밋되지 않은 `scripts/review.ps1` 수정분으로 추정되며, 이번 리뷰 범위 밖이다.
  - 제안: `review.ps1`의 basetemp를 `Join-Path $root '.cache/review-pytest'`로 고친다(`.cache/`는 이미 제외됨). 또는 해당 패턴을 `.gitignore`에 추가한다. 사용자 수정분이므로 사용자 확인 후 반영한다.
  - [반영됨]: 원인은 이번 호출의 PYTEST_ADDOPTS에 넣은 Windows 역슬래시 경로가 pytest 옵션 파싱에서 소실된 것이었다. 호출 환경을 C:/.../.cache/review-pytest 형태로 바꾸고 잘못 생성한 임시폴더만 절대 경로 확인 후 삭제했다. 사용자 수정분인 review.ps1은 변경하지 않았다.

### 제안
- 동점일 때 근거(가장 비슷한/다른 중분류)는 첫 번째 집단 기준으로만 나온다. 화면에 안내 문구가 있어 문제는 아니다. 발표 Q&A에 대비해 공동 집단별 근거를 탭으로 보여주는 방안을 고려할 수 있다.

### 이전 라운드 미해결 항목
- R2-1: [반영 안 함] `scripts/review.ps1`은 사용자 수정분이 있어 손대지 않음 → 낮음 항목이고 사용자 소유 파일이라 타당. **종결**. 같은 파일의 basetemp 문제는 R3-6로 따로 적었다.
- R2-2: [반영됨] Python 3.11 venv와 `--basetemp` 안내 → 이번 자동 검사에서 3.11 venv로 17개 모두 통과했다. **종결**.
- R1-1, R1-2 후속 확인: 확장자 CSV/XLSX 제한, `isMock`와 예시 데이터 배지, 플래그 off·분모 0일 때 `null`과 테스트 모두 확인했다. **종결 유지**.

### 테스트 결과
`scripts/review.ps1`이 미리 실행한 결과를 옮긴다(리뷰어는 직접 실행하지 않음).
- pipeline `.venv\Scripts\python.exe -m pytest -q`: **PASSED** — 17 passed (14.31s)
- backend `gradlew.bat test --console=plain`: **PASSED** — BUILD SUCCESSFUL. `:test`가 UP-TO-DATE라 이번 실행에서는 캐시된 이전 성공 결과를 썼다(소스 변경 없음).
- frontend `npm.cmd run build`: **PASSED** — `tsc --noEmit`와 vite 빌드 성공(603 modules, Explore 청크 별도 분리)

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
