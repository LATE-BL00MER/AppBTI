# API 명세 v1 (11/12 확정안)

- 기준 자료: 우서현 회의안 1·2·3(요약 PDF·근거 엑셀, 로컬 전용)과 11/11 회의 결정사항. 노션과 다르면 **이 문서와 회의안을 따른다.**
- 모든 경로는 `/api` 기준이다. 서버는 설문 응답을 저장하지 않는다.
- 이 문서와 `docs/examples/`의 모든 수치는 **직접 만든 가상 값**이다. 실제 LG U+ 수치를 넣지 않는다.
- 상태 표시: **유지**(지금 구현 그대로) / **변경**(구현 수정 필요) / **신규**(새로 구현).

## 0. 한눈에 보기

| 메서드·경로 | 담당 | 상태 | 쓰는 화면 |
|---|---|---|---|
| GET `/meta` | 임기범 | 유지 (+필드 1개) | 공통(배지·출처), 탐색 필터 |
| GET `/profiles?month=` | 임기범 | 유지 | 탐색(두 연령대 비교) |
| GET `/profiles/trend?minor=` | 임기범 | 유지 | 탐색(월별 추이) |
| GET `/explore/ranking` | 임기범 | **신규** | 탐색(연령대별 랭킹) |
| GET `/survey/questions` | 신진용 | **변경** | 설문 |
| POST `/survey/result` | 신진용 | **변경** | 결과 |

화면별 호출 순서

1. 앱 시작: `GET /meta`. `isMock=true`이면 상단에 "예시 데이터" 배지를 붙이고, `source`를 출처 문구로 쓴다.
2. 설문: `GET /survey/questions` → 응답 모으기 → `POST /survey/result`
3. 결과: 2번 응답 하나로 화면 전체를 그린다(추가 호출 없음).
4. 탐색: `GET /explore/ranking` + `GET /profiles/trend` + (두 연령대 비교 시) `GET /profiles`

---

## 1. 공통 규칙

### 1-1. 쿼리 `dataset`
모든 GET과 POST `/survey/result`는 `dataset`(기본 `basic`)을 받는다. `time`은 시간 지표가 있는 **가상** 데이터이며, 실제 산출물을 적재하면 제공하지 않는다(`/meta.availableDatasets`로 확인).

### 1-2. 결측
- 집단 수치가 없으면 `null`이다. **0으로 채우지 않는다.** 화면은 "데이터 없음"으로 표시하고 차트에 0으로 그리지 않는다.
- 배열은 `null` 대신 빈 배열 `[]`을 쓴다.

### 1-3. HTTP 상태와 오류 형식

| 상태 | 언제 |
|---|---|
| 200 | 정상. 설문 비교가 불가능한 경우(`status=insufficient`)와 탐색 랭킹을 낼 수 없는 경우(`status=unavailable`)도 200이다 |
| 400 | 잘못된 입력: 없는 연령대·월·중분류·대분류, 잘못된 `limit`, 설문 응답 형식 오류(아래 4-2) |
| 404 | 제공하지 않는 `dataset` |
| 503 | 서버에 산출물(`profiles.json`)이 없음 |

오류 본문은 항상 `{"message": "사람이 읽을 수 있는 한국어 이유"}`다. 잘못된 JSON 본문은 Spring 기본 400이다.

### 1-4. 정렬과 동점
- 같은 입력이면 항상 같은 결과다. 무작위를 쓰지 않는다.
- 순위는 **경쟁 순위**(`1, 1, 3, 4…`)다. 동점 판정은 **화면에 보이는 반올림 값**(소수 1자리)으로 한다. 그래야 화면과 순위가 어긋나지 않는다.
- 동점끼리는 `/meta.ageGroups` 순서(연령대) 또는 `minorCode` 오름차순(중분류)으로 나열한다. 이 순서는 우열을 뜻하지 않는다.

### 1-5. 화면 문구
- 금지: "당신은 ○○대입니다", "디지털 나이", "정확도", "일치 확률", "이용률", "인기", "○○대가 가장 많이 쓰는"
- 사용: "응답 패턴이 ○○ 집단의 통계와 가장 비슷합니다", "패턴 유사도", "이 분류 이용자 중 ○○대 비중"
- 출처 옆에 "LG U+ 제공 연령대·기간(2025년 1~6월) 집계"를 표시한다(`/meta.source`).

---

## 2. GET `/meta` — 유지 (+`survey` 필드 신규)

예시: [examples/meta.json](examples/meta.json)

| 필드 | 타입 | null | 의미 |
|---|---|---|---|
| `schemaVersion` | integer | 아니요 | 산출물 스키마 버전(현재 1) |
| `isMock` | boolean | 아니요 | 가상 데이터 여부. `true`면 "예시 데이터" 배지 |
| `source` | string | 예 | 출처·범위 문구 |
| `months` | string[] | 아니요 | 제공 월 `YYYY-MM` 오름차순. 마지막이 최신월 |
| `ageGroups[]` | {id, label} | 아니요 | 연령대 6개. 이 순서가 화면 표시 순서다 (`under20, 20s, 30s, 40s, 50s, 60plus`) |
| `majorCategories` | string[] | 아니요 | 대분류 14개 |
| `minorCategories[]` | {code, name, major, description} | 아니요 | 중분류(안전민감 제외 104개). `description`은 null 가능 |
| `metrics.weightedReference` | boolean | 아니요 | 기준일수·상대 빈도 사용 가능 여부. LG U+ 분모 확인 전에는 `false` |
| `metrics.dailyTime`, `metrics.timeComparable` | boolean | 아니요 | 이용시간 지표. 이번 중간발표에서는 `false` |
| `avgDaysDenominator` | string | 예 | 평균 이용일수 분모. 미확인이면 `null` |
| `continuityBreaks` | string[] | 아니요 | 집계 기준이 바뀐 달. 추이 선을 끊는다 |
| `quality` | object | 아니요 | `rowCount`, `warningCount` |
| `availableDatasets` | string[] | 아니요 | 서버가 제공하는 dataset |
| `dataset` | string | 아니요 | 이번 응답의 dataset |
| `comparisonEnabled` | boolean | 아니요 | 설문 비교 켜짐 여부(`similarity.yaml`의 `enabled`) |
| `zeroDaysPolicy` | string | 예 | **변경 없음(하위 호환).** 새 코드는 `survey.zeroCountPolicy`를 쓴다 |
| `survey` | object | 아니요 | **신규.** `{questionCount, period, method}` 설문 요약. 홈 화면 소개 문구용 |

---

## 3. 조회·탐색 API (임기범)

### 3-1. GET `/profiles?month=` — 유지
- 입력: `month`(생략 시 최신월), `dataset`
- 응답: `{month, profiles: Row[]}`. 한 달 = 6개 연령대 × 중분류 수. 없는 조합도 `status=missing`이고 값이 `null`인 행으로 내려간다.

`Row` (Python 산출물 그대로. Java에서 다시 계산하지 않는다)

| 필드 | 타입 | null | 의미 |
|---|---|---|---|
| `month`, `ageGroup`, `minorCode` | string | 아니요 | 키 |
| `status` | string | 아니요 | `normal` / `missing` / `suppressed` |
| `uu` | number | 예 | 월간 유니크 이용자수. **화면에 단독으로 크기 비교하지 않는다**(모수 없음) |
| `avgDays` | number | 예 | 원본 `AVG_TADV_DAYS`. 회의안 해석은 "월간 접속 횟수"(TODO 아래) |
| `ageShare` | number | 예 | 이 중분류 이용자 중 이 연령대 비중(0~1). 한 연령대라도 없으면 `null` |
| `referenceDays` | number | 예 | 기준값(UU 가중 평균). `weightedReference=false`면 `null` |
| `relativeFrequency` | number | 예 | `avgDays ÷ referenceDays`. `weightedReference=false`면 `null` |
| `avgDailyTime` | number | 예 | 이용시간. 이번에는 화면에 쓰지 않는다 |
| `segment` | integer | 아니요 | 집계 기준 구간. 다르면 선을 잇지 않는다 |

두 연령대 비교 화면은 새 API 없이 이 응답에서 두 연령대 행을 골라 쓴다.

### 3-2. GET `/profiles/trend?minor=` — 유지
- 입력: `minor`(필수, 중분류 코드), `dataset`
- 응답: `{minorCode, profiles: Row[], continuityBreaks}`. 6개월 × 6개 연령대.
- 빠진 달은 값이 `null`이며 **선으로 잇지 않는다.** `segment`가 다르면 잇지 않는다.

### 3-3. GET `/explore/ranking` — 신규

연령대 하나를 고르면, 그 연령대가 **상대적으로 두드러지는 중분류** 순서로 보여 준다.

예시: [examples/explore_ranking.json](examples/explore_ranking.json), [examples/explore_ranking_unavailable.json](examples/explore_ranking_unavailable.json)

| 입력 | 필수 | 의미 |
|---|---|---|
| `ageGroup` | 예 | `/meta.ageGroups[].id` |
| `month` | 아니요 | 생략 시 최신월 |
| `basis` | 아니요 | `ageShare`(기본) 또는 `relativeFrequency` |
| `major` | 아니요 | 이 대분류의 중분류만 |
| `limit` | 아니요 | 1 이상 정수. 생략 시 전체 |
| `dataset` | 아니요 | 기본 `basic` |

**`basis` 두 가지**

| basis | 값 | 언제 쓸 수 있나 | 화면 문구 예 |
|---|---|---|---|
| `ageShare` (기본) | 이 분류 이용자 중 이 연령대 비중 | **항상** (LG U+ 답변과 무관) | "이 분류 이용자 중 30대 비중 28%" |
| `relativeFrequency` | 평균 이용 횟수 ÷ 연령 간 기준값 | `metrics.weightedReference=true`일 때만 | "기준값의 1.5배" |

> 기본값을 `ageShare`로 둔 이유: `relativeFrequency`는 LG U+의 분모 답변이 오기 전에는 모두 `null`이라, 중간발표 때 탐색 화면이 비어 버린다. `ageShare`는 지금 바로 쓸 수 있는 허용 지표다(AGENTS.md 6-1). 11/11 회의 결정사항의 연령대별 차이 정리도 이 지표 기준이다.

응답

| 필드 | 타입 | null | 의미 |
|---|---|---|---|
| `status` | string | 아니요 | `available` / `unavailable` |
| `reason` | string | 예 | `unavailable`일 때 이유 |
| `month` | string | 아니요 | 기준월 |
| `ageGroup` | {id, label} | 아니요 | 고른 연령대 |
| `major` | string | 예 | 요청한 대분류. 없으면 `null` |
| `basis` | string | 아니요 | 정렬 기준 |
| `isMock`, `source` | boolean, string | 아니요/예 | `/meta`와 같음 |
| `items[].rank` | integer | 아니요 | 경쟁 순위 |
| `items[].minorCode`, `name`, `major` | string | 아니요 | 중분류 |
| `items[].value` | number | 아니요 | `basis` 값(정렬에 쓴 값) |
| `items[].ageShare` | number | 예 | 참고용 |
| `items[].avgDays`, `referenceDays`, `relativeFrequency` | number | 예 | 참고용(산출물 그대로) |
| `excluded[]` | {minorCode, name, reason} | 아니요 | `basis` 값이 `null`이라 뺀 중분류. `reason`은 행의 `status` 또는 `reference_unavailable` |

규칙
1. 정렬: `value` 내림차순 → `minorCode` 오름차순. 동점 판정은 `ageShare`면 소수 3자리, `relativeFrequency`면 소수 2자리 반올림 값으로 한다.
2. `value`가 `null`인 중분류는 0으로 두지 않고 `excluded`에 넣는다.
3. `basis=relativeFrequency`인데 `weightedReference=false`면 200, `status=unavailable`, `items=[]`이다.
4. Java는 **필터·정렬만** 한다. 지표는 다시 계산하지 않는다(산출물 값 그대로).
5. 화면 문구: "○○대에서 비중이 큰 분류"처럼 쓴다. "○○대가 가장 많이 쓰는"은 쓰지 않는다. `ageShare`는 연령대마다 전체 이용자 규모가 달라서 높게 나오는 정도가 다르다. 그래서 연령대끼리 같은 숫자로 우열을 매기지 않는다.

---

## 4. 설문·결과 API (신진용)

### 4-0. 회의안에서 바뀐 점 (구현 전에 꼭 읽기)

| 항목 | 지금 구현 | v1 (회의안 기준) |
|---|---|---|
| 묻는 것 | 며칠 사용(0~31일) | **지난달 접속해 이용을 시작한 횟수** (0 이상 정수, **상한 없음**) |
| 응답 종류 | 일수 / null | `answered`(횟수) / `unknown`(모르겠음) / `skipped`(건너뛰기) |
| 0 응답 | 정책 미정 | 0은 "사용 안 함"이지만 **비교에서는 제외**(`zero_count_policy: exclude_pending_denominator`) |
| 문항 | 중분류 전체 | `config/survey_questions.yaml`의 활성 문항 **12개**(q01~q12, q08 게임은 조건부). 보완 q13·q14는 비활성 |
| 유사도 | 범위 정규화 절대차 | **코사인**, 분모는 기준월 6개 연령대 중 최댓값 `r(c)` |
| 순위 | `scores` | `rankings`(6개 전체, 공동 순위) |
| 닮은·다른 항목 | 정규화 절대차 | 그대로 **정규화 절대차** 기준(코사인 기여도라고 부르지 않음). 분모만 `r(c)`로 바뀜 |
| 최소 비교 수 | 시연 4개 | **6개** |
| 대분류 점수(레이더) | 초안 필드 | **없음.** 이번 회의안에서 만들지 않는다 |
| 유형 이름 | 초안 필드 | `resultType` 자리만 두고 `null` |
| 시간 문항 | 조건부 | **끔** |

설정 파일 두 개(신진용이 엑셀 「설문문항」「유사도검증」 시트대로 작성):

```yaml
# config/similarity.yaml (실제 데이터)
enabled: false            # 회의안 기본값. 중간발표 시연 때 켤지 팀 확인 — TODO(확인 필요)
method: cosine
normalization: reference_max
minimum_categories: 6     # 검토값
tie_policy: shared_rank
zero_count_policy: exclude_pending_denominator
weights: {general_mall: 1, food_delivery: 1, ...}   # 우선 12개 1, 보완 0
daily: false
weekly: false
types: []                 # 유형 이름 미확정
```

```yaml
# config/survey_questions.yaml
period: monthly           # A안. B안(지난 7일)은 사전 검증용이라 서버에 넣지 않는다
questions:
  - id: q01
    minor_code: general_mall      # codebook.yaml의 중분류 코드와 같아야 함
    role: primary                 # primary / conditional / supplement
    enabled: true
    text: "지난달 1일부터 말일까지 종합쇼핑몰 앱이나 사이트에 접속해 이용을 시작한 것은 대략 몇 회인가요?"
    guide: "구매 완료뿐 아니라 검색·둘러보기를 시작한 접속도 포함하는 초안이다."
```

목업 시연 설정(`similarity.mock.yaml`)은 `method: range_abs`(지금 방식)를 그대로 둔다. 계산기는 `method` 값으로 두 방식을 고른다.

### 4-1. GET `/survey/questions` — 변경

예시: [examples/survey_questions.json](examples/survey_questions.json)

| 필드 | 타입 | null | 의미 |
|---|---|---|---|
| `month` | string | 아니요 | 비교 기준월(최신월) |
| `period` | string | 아니요 | `monthly` |
| `questions[]` | object[] | 아니요 | **활성 문항만**, `id` 순 |
| `questions[].id` | string | 아니요 | `q01`… |
| `questions[].minorCode`, `name`, `major` | string | 아니요 | 연결된 중분류(코드북 기준) |
| `questions[].role` | string | 아니요 | `primary` / `conditional` |
| `questions[].text` | string | 아니요 | 질문 문구 |
| `questions[].guide` | string | 예 | 혼동 방지 안내 |
| `answerFormat` | object | 아니요 | `{type: "count", min: 0, max: null, allowUnknown: true, allowSkip: true}`. **`max=null`은 상한 없음**이다. 미리 선택된 값을 두지 않는다 |
| `minimumCategories` | integer | 아니요 | 최소 비교 수(6) |
| `zeroCountPolicy` | string | 아니요 | 0회 처리 정책 |
| `comparisonEnabled` | boolean | 아니요 | `false`면 결과 화면 대신 탐색 안내 |
| `timeAvailable` | boolean | 아니요 | 이번에는 `false` |

삭제: `maxDays`(상한이 없어짐). `zeroDaysPolicy`는 `zeroCountPolicy`로 이름을 바꾼다.

### 4-2. POST `/survey/result` — 변경

요청

```json
{
  "month": null,
  "answers": [
    {"questionId": "q01", "status": "answered", "count": 30},
    {"questionId": "q02", "status": "answered", "count": 0},
    {"questionId": "q08", "status": "skipped",  "count": null},
    {"questionId": "q11", "status": "unknown",  "count": null}
  ]
}
```

| 필드 | 타입 | null | 의미 |
|---|---|---|---|
| `month` | string | 예 | 생략·null이면 최신월 |
| `answers[].questionId` | string | 아니요 | `/survey/questions`의 `id` |
| `answers[].status` | string | 아니요 | `answered` / `unknown` / `skipped` |
| `answers[].count` | integer | 예 | `answered`면 0 이상 정수, 그 밖에는 `null` |

400이 되는 경우: 없는·비활성 문항, 같은 문항 중복, `answered`인데 `count`가 null·음수·소수, `answered`가 아닌데 `count`가 있음, `status` 오타. 답하지 않은 문항은 `answers`에서 빠져도 된다(`skipped`와 같게 처리).

**계산** (`method: cosine`, `normalization: reference_max`)

1. 비교 대상 중분류 `c`: 응답이 `answered`이고 `count > 0`이며, **6개 연령대 모두** 기준월 `avgDays` 값이 있고 `r(c) > 0`인 것.
   `r(c)` = 기준월 6개 연령대 `avgDays` 중 최댓값
2. 정규화: `u(c) = count ÷ r(c)`, `p(a,c) = avgDays(a,c) ÷ r(c)`. `u`는 1을 넘을 수 있고 **자르지 않는다.**
3. 연령대 `a`의 점수: `100 × Σ w·u·p ÷ √(Σ w·u² × Σ w·p²)`. 소수 1자리로 반올림한다.
4. 근거(닮은·다른 항목): 1위 집단 기준 `normalizedDifference = |count − avgDays(a,c)| ÷ r(c)`.

응답

예시: [examples/survey_result.json](examples/survey_result.json), [examples/survey_result_insufficient.json](examples/survey_result_insufficient.json)

| 필드 | 타입 | null | 의미 |
|---|---|---|---|
| `status` | string | 아니요 | `comparable` / `insufficient` |
| `reasonCode` | string | 예 | 비교 불가 이유 코드(아래 표). `comparable`이면 `null` |
| `reason` | string | 예 | 화면에 그대로 보여 줄 한국어 문장 |
| `month` | string | 아니요 | 비교 기준월 |
| `method` | string | 아니요 | `cosine` (목업은 `range_abs`) |
| `answeredCount` | integer | 아니요 | `answered` 응답 수(0회 포함) |
| `comparedCategories` | integer | 아니요 | 실제 비교한 중분류 수 |
| `minimumCategories` | integer | 아니요 | 최소 비교 수 |
| `rankings[]` | object[] | 아니요 | 6개 연령대 전체. 점수 내림차순, 동점은 `/meta.ageGroups` 순 |
| `rankings[].ageGroup`, `label` | string | 아니요 | 연령대 |
| `rankings[].score` | number | 아니요 | 패턴 유사도 0~100, 소수 1자리 |
| `rankings[].rank` | integer | 아니요 | 경쟁 순위 |
| `rankings[].isTied` | boolean | 아니요 | 같은 순위가 둘 이상이면 `true` |
| `matches[]` | {id, label} | 아니요 | 1위(공동이면 모두) |
| `evidenceGroup` | {id, label} | 예 | 근거를 계산한 집단. 공동 1위면 `/meta.ageGroups` 순으로 첫 집단 |
| `closest[]`, `farthest[]` | object[] | 아니요 | 닮은 항목·다른 항목 각각 최대 3개, 서로 겹치지 않음 |
| `…[].minorCode`, `name`, `major` | string | 아니요 | 중분류 |
| `…[].questionId` | string | 아니요 | 문항 ID |
| `…[].userCount` | integer | 아니요 | 내 응답 횟수 |
| `…[].groupValue` | number | 아니요 | `evidenceGroup`의 기준월 `avgDays` |
| `…[].normalizedDifference` | number | 아니요 | 위 4번 값. 작을수록 비슷함 |
| `excluded[]` | {questionId, minorCode, name, reason} | 아니요 | 비교에서 뺀 문항과 이유 코드 |
| `resultType` | {name, description, status} | 아니요 | 유형 이름 자리. 지금은 `name=null, description=null, status="pending"` |
| `nextAction` | {path, label, message} | 예 | 비교 불가일 때 탐색 화면 안내(`path: "/explore"`). 비교 가능이면 `null` |
| `isMock`, `source` | boolean, string | 아니요/예 | `/meta`와 같음 |

`reasonCode` (비교 불가)

| 코드 | 뜻 |
|---|---|
| `comparison_disabled` | `similarity.yaml`의 `enabled=false` |
| `too_few_categories` | 비교 가능한 중분류가 `minimumCategories`보다 적음 |
| `zero_norm` | 비교 벡터 크기가 0이라 코사인을 계산할 수 없음 |

`excluded[].reason`

| 코드 | 뜻 |
|---|---|
| `zero_count` | 0회 응답(평균 분모 확인 전 비교 제외) |
| `unknown` | 모르겠음 |
| `skipped` | 건너뛰기 또는 응답 없음 |
| `group_missing` | 6개 연령대 중 값이 없는 집단이 있음 |
| `reference_zero` | `r(c)`가 0 |

규칙
1. `insufficient`이면 `rankings`, `matches`, `closest`, `farthest`는 `[]`, `evidenceGroup`은 `null`이다. 점수를 0으로 채우지 않는다.
2. `closest`: `normalizedDifference` 오름차순 → `minorCode` 순으로 최대 3개. `farthest`: `closest`를 뺀 나머지에서 내림차순 → `minorCode` 순으로 최대 3개.
3. 1·2위 점수가 비슷하면 "30대와 가장 비슷 · 40대와도 비슷"처럼 2위도 함께 보여 준다(11/11 결정). 차이 기준은 화면에서 정한다. TODO(확인 필요): 기준값(예: 1.0점 이내)
4. 결과는 **과거 제공 기간의 집단 통계와 비교한 것**이다. 같은 달 실측이나 개인 기록 분석처럼 쓰지 않는다.

**삭제되는 필드**(지금 구현 → v1): `scores` → `rankings`, `closest[].userDays/groupDays/differenceDays/userMinutes/groupMinutes` → `userCount/groupValue`, `normalizedDistance` → `normalizedDifference`. 레이더용 `majorScores`는 만들지 않는다.

---

## 5. 담당별 구현 체크리스트

**신진용**
- [ ] `config/survey_questions.yaml`, `config/similarity.yaml` 작성(엑셀 기준). 문항 코드와 `codebook.yaml` 중분류 코드가 같은지 확인(현우)
- [ ] `SimilaritySettings`: `cosine`/`range_abs`, `reference_max`, `zero_count_policy` 지원. 미지원 값이면 기동 실패
- [ ] `SurveyRequest` → `questionId/status/count`, 400 검사
- [ ] `SimilarityCalculator`: 코사인, `rankings`, `reasonCode`, `excluded.reason`
- [ ] 테스트: 코사인 값, 0회 제외, 최소 6개 미달, 공동 순위, 결측 집단, 같은 입력·같은 결과, `enabled=false`

**임기범**
- [ ] `ProfileRepository`가 `data/processed/real/profiles.json`을 읽고, 어떤 파일을 적재했는지 로그에 남김(지금은 아무 표시 없이 목업으로 넘어감)
- [ ] `/explore/ranking`(`basis=ageShare` 기본)
- [ ] `/meta.survey` 필드
- [ ] `ApiControllerTests` fixture를 실제 구조로(6구간, 일부 `null`, `weightedReference` true/false). 값은 가상

**심유진**
- [ ] 설문: 횟수 입력(상한 없음, 기본값 없음) + 「모르겠음」「건너뛰기」 버튼, `guide` 표시
- [ ] 결과: `rankings` 막대, 1·2위 근소 시 2위 함께, `closest`/`farthest`, `resultType` placeholder, `insufficient`일 때 `reason` + `nextAction`. **레이더 제거**
- [ ] 탐색: `/explore/ranking`(ageShare), `/profiles/trend`(null은 선 끊기)

---

## 6. TODO(확인 필요)

- `similarity.yaml`의 `enabled`: 회의안 기본값은 `false`다. 그대로 두면 결과 화면이 나오지 않으므로, 중간발표 시연에서 켤지 팀이 정한다.
- 코사인 점수가 모두 90점대로 몰리는 문제: 응답과 집단 값이 모두 0 이상이라 코사인이 높게 나오기 쉽다(가상 예시에서도 6개 집단이 92~100점). 화면에서 점수 자체보다 **순위와 1위와의 차이**를 강조할지 정한다.
- `avgDays`를 "월간 접속 횟수"로 읽는 것은 회의안의 **가정**이다. LG U+ 답변(분모·정의)에 따라 문항 문구와 0회 정책을 다시 본다.
- 「접속 1회」 정의(재접속·위젯·백그라운드), q08 게임 포함 여부, 보완 문항 교체.
- 1·2위 근소 차이 기준값.
- 유형 이름·설명(우서현). 정해지면 `resultType`만 채운다.
