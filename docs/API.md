# API 명세 v2 (11/21, PR #25 구현 기준)

- v1(11/12 확정안)을 대체한다. 노션 「AppBTI API 목록 (v2 초안)」과 다르면 **이 문서와 구현 코드를 따른다.**
- 모든 경로는 `/api` 기준이다. 서버는 설문 응답을 저장하지 않는다.
- 이 문서와 `docs/examples/`의 모든 수치는 **직접 만든 가상 값**이다. 실제 LG U+ 수치를 넣지 않는다.
- 상태 표시: **유지**(v1 그대로) / **변경**(v1에서 수정) / **신규** / **꺼짐**(구현했지만 설정으로 끔)

## 0. 한눈에 보기

| 메서드·경로 | BE | FE | v1 대비 | 쓰는 화면 |
|---|---|---|---|---|
| GET `/meta` | 신진용 | 심유진 | **변경** (`survey` 값, `metrics`) | 공통(배지·출처), 홈 소개 문구 |
| GET `/survey/questions` | 신진용 | 심유진 | **변경** | 설문 |
| POST `/survey/result` | 신진용 | 심유진 | **변경** | 결과 |
| GET `/profiles?month=` | 임기범 | 심유진 | 유지 | 탐색(두 연령대 비교) |
| GET `/profiles/trend?minor=` | 임기범 | 심유진 | 유지 | 탐색(월별 추이) |
| GET `/explore/ranking` | 임기범 | 심유진 | 유지 (`relativeFrequency` 사용 가능) | 탐색(연령대별 랭킹) |
| GET `/explore/signals` | 임기범 | - | **꺼짐** (발표 범위 제외) | - |

데이터 파이프라인 검증·신뢰성 검토는 우서현·차현우가 맡는다.

화면별 호출 순서

1. 앱 시작: `GET /meta`. `isMock=true`이면 상단에 "예시 데이터" 배지를 붙이고, `source`를 출처 문구로 쓴다.
2. 설문: `GET /survey/questions` → 응답 모으기 → `POST /survey/result`
3. 결과: 2번 응답 하나로 화면 전체를 그린다(추가 호출 없음).
4. 탐색: `GET /explore/ranking` + `GET /profiles/trend` + (두 연령대 비교 시) `GET /profiles`

### 데이터 종류에 따른 응답 형식

설문 API는 데이터마다 `similarity*.yaml`의 `method`로 응답 형식이 정해진다. **실제 데이터와 목업 모두 v2**라서 프론트는 v2 형식 하나만 처리한다.

| 데이터 | 설정 | 설문 문항 |
|---|---|---|
| 실제 데이터 | `similarity.yaml` → `clr_nearest` | `survey_questions.yaml` (14문항) |
| 목업 데이터 | `similarity.mock.yaml` → `clr_nearest` | `survey_questions.mock.yaml` (가상 중분류 12문항: 일수 6 + 시간 6. `basic`은 시간 지표가 없어 일수 6문항만 나감) |

v1 계산 코드(`SimilarityCalculator`)는 남아 있어 `method`를 v1 방식으로 바꾸면 v1 응답이 나온다. v1 명세는 git 기록의 이전 `docs/API.md`에 있다.

### 지표 정의 (LG U+ 답변 기준으로 고정)

| 원본 컬럼 | 내부 필드 | 정의 | 쓰는 방식 |
|---|---|---|---|
| `AVG_TADV_DAYS` | `avgDays` | **이용자 1명당 월 평균 이용일수** (분모: 그 연령대·분류의 이용자 수) | 설문: `avgDays ÷ 그 달 실제 일수` → 이용일 비율. 탐색: 원본 값과 기준일수 |
| `AVG_ASMP_VSIT_TM` | `avgDailyTime` | **이용자 1명당 일평균 이용시간 (분)** | 설문 시간 문항의 기준값 |
| `UNQ_USER_CNT` | `uu` | 월간 유니크 이용자 수 | 구성비(`ageShare`), 기준일수 가중치. 설문 매칭에는 쓰지 않음 |

- 두 평균 모두 **이용자 기준**이다. 그래서 설문의 "사용 안 함" 응답은 비교에서 뺀다.
- 일평균 이용시간의 '하루' 기준(이용한 날 / 그달 전체 일수)은 LG U+에 다시 확인하고 있다(8장). 그 전까지는 설정으로 두 버전을 고를 수 있다(4-0).

### 전체 흐름

```
[파이프라인, 서버 시작 전]  원본 CSV → 정제(clean.csv) → profiles → surveyReference(연령대 × 문항 6개월 평균 로그값) → profiles.json
[Spring 시작]             profiles.json, survey_questions.yaml, similarity.yaml, peer_messages.yaml 적재
[POST /survey/result]     검사 → 미응답 제외 → 6문항 확인 → 값 변환 → 로그 → 답한 문항으로 양쪽 CLR
                          → 6개 연령대와 유클리드 거리 → 순위 → 근소 판정 → 근거 → 또래 비교 → 응답
```

- 집단 지표 계산(기준일수, 월별 비율, 6개월 평균, 로그)은 **Python 파이프라인**에서만 한다(AGENTS.md 4장).
- Spring은 응답마다 **평균 빼기(CLR)와 거리 계산만** 한다. 답한 문항 묶음이 사람마다 달라서 CLR을 미리 저장할 수 없다.

---

## 1. 공통 규칙

### 1-1. 쿼리 `dataset`
모든 GET과 POST `/survey/result`는 `dataset`(기본 `basic`)을 받는다. 제공하는 값은 `/meta.availableDatasets`로 확인한다.

### 1-2. 결측
- 집단 수치가 없으면 `null`이다. **0으로 채우지 않는다.** 화면은 "데이터 없음"으로 표시하고 차트에 0으로 그리지 않는다.
- 배열은 `null` 대신 빈 배열 `[]`을 쓴다.

### 1-3. HTTP 상태와 오류 형식

| 상태 | 언제 | `code` |
|---|---|---|
| 200 | 정상. 설문 비교 불가(`status=insufficient`), 랭킹·신호를 낼 수 없음(`status=unavailable`)도 200 | - |
| 400 | 잘못된 입력 | `MISSING_PARAMETER`, `INVALID_MONTH`, `INVALID_AGE_GROUP`, `INVALID_MINOR`, `INVALID_MAJOR`, `INVALID_BASIS`, `INVALID_TYPE`, `INVALID_METRIC`, `INVALID_LIMIT`, `MALFORMED_JSON`, `UNKNOWN_QUESTION`, `DUPLICATE_QUESTION`, `INVALID_STATUS`, `INVALID_VALUE` |
| 404 | 제공하지 않는 `dataset`, 없는 경로 | `DATASET_NOT_FOUND`, `NOT_FOUND` |
| 405 / 415 | 지원하지 않는 메서드 / `Content-Type` | `METHOD_NOT_ALLOWED`, `UNSUPPORTED_MEDIA_TYPE` |
| 500 | 예상하지 못한 서버 오류 | `INTERNAL_ERROR` |
| 503 | 서버에 산출물·설문 설정이 없음 | `PROFILES_UNAVAILABLE`, `SURVEY_UNAVAILABLE` |

오류 본문은 항상 아래 형식이다. 화면 분기는 `code`로 하고, `message`(한국어)는 그대로 보여 줘도 된다.

```json
{"status": 400, "code": "INVALID_MONTH", "message": "제공하지 않는 기준월입니다."}
```

### 1-4. 정렬과 동점
- 같은 입력이면 항상 같은 결과다. 무작위를 쓰지 않는다.
- 순위는 **경쟁 순위**(`1, 1, 3, 4…`)다. 동점은 **화면에 보이는 반올림 값**으로 판정한다(설문 거리 소수 3자리, `ageShare` 소수 3자리, `relativeFrequency` 소수 2자리).
- 동점끼리는 `/meta.ageGroups` 순서(연령대) 또는 `minorCode` 오름차순(중분류)으로 나열한다. 이 순서는 우열을 뜻하지 않는다.

### 1-5. 화면 문구
- 금지: "당신은 ○○대입니다", "디지털 나이", "정확도", "일치 확률", "일치율", "이용률", "인기", "○○대가 가장 많이 쓰는", "○배 많이 써요"(절대량 비교)
- 사용: "전체 응답 패턴은 ○○ 집단의 통계와 가장 가까워요", "패턴 유사도", "이 분류 이용자 중 ○○대 비중", "응답하셨어요"
- 출처 옆에 "LG U+ 제공 연령대·기간(2025년 1~6월) 집계"를 표시한다(`/meta.source`).

---

## 2. GET `/meta` — 변경

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
| `metrics.weightedReference` | boolean | 아니요 | 기준일수·상대 빈도 사용 가능 여부. **v2에서 `true`** (LG U+ 답변: 평균 이용일수 분모 = 이용자) |
| `metrics.dailyTime` | boolean | 아니요 | 일평균 이용시간 제공 여부. **v2에서 `true`** |
| `metrics.timeComparable` | boolean | 아니요 | v1 설문용 플래그. '하루' 기준 확인 전이라 `false`. **v2 설문은 이 값을 쓰지 않는다**(`survey.timeAvailable`을 쓴다) |
| `avgDaysDenominator` | string | 예 | 평균 이용일수 분모. v2에서 `users` |
| `continuityBreaks` | string[] | 아니요 | 집계 기준이 바뀐 달. 추이 선을 끊는다 |
| `quality` | object | 아니요 | `rowCount`, `warningCount` |
| `availableDatasets` | string[] | 아니요 | 서버가 제공하는 dataset |
| `dataset` | string | 아니요 | 이번 응답의 dataset |
| `comparisonEnabled` | boolean | 아니요 | 설문 비교 켜짐 여부(`similarity.yaml`의 `enabled`) |
| `zeroDaysPolicy` | string | 예 | v1 하위 호환. v2 화면은 쓰지 않는다 |
| `survey` | object | 아니요 | `{questionCount, period, method, timeAvailable}` 설문 요약. 홈 화면 소개 문구용 |

`survey` 값

| 필드 | v1 | v2 |
|---|---|---|
| `questionCount` | 활성 문항 수(12) | 활성 문항 수(**14**). 설정 파일이 없으면 `null`(화면은 숫자를 지어내지 않는다) |
| `period` | `monthly` | **`last7days`** (일수 문항 기준 기간) |
| `method` | `cosine` | **`clr_nearest`** |
| `timeAvailable` | 없음 | **신규.** 시간 문항을 실제로 내보내는지 |

---

## 3. 조회·탐색 API (임기범)

모두 Python 산출물 값을 그대로 내려준다. Java는 **필터·정렬만** 하고 지표를 다시 계산하지 않는다.

### 3-1. GET `/profiles?month=` — 유지
- 입력: `month`(생략 시 최신월), `dataset`
- 응답: `{month, profiles: Row[]}`. 한 달 = 6개 연령대 × 중분류 수. 없는 조합도 `status=missing`이고 값이 `null`인 행으로 내려간다.
- 400: `INVALID_MONTH`

`Row`

| 필드 | 타입 | null | 의미 |
|---|---|---|---|
| `month`, `ageGroup`, `minorCode` | string | 아니요 | 키 |
| `status` | string | 아니요 | `normal` / `missing` / `suppressed` |
| `uu` | number | 예 | 월간 유니크 이용자수. **화면에 단독으로 크기 비교하지 않는다**(모수 없음) |
| `avgDays` | number | 예 | 이용자 1명당 월 평균 이용일수 |
| `ageShare` | number | 예 | 이 중분류 이용자 중 이 연령대 비중(0~1). 한 연령대라도 없으면 `null` |
| `referenceDays` | number | 예 | 기준일수 = `Σ(avgDays × uu) ÷ Σuu` (연령대 6개, UU 가중 평균). 비교 연령대에 결측이 있으면 `null` |
| `relativeFrequency` | number | 예 | `avgDays ÷ referenceDays`. 1보다 크면 연령 간 평균보다 자주 씀 |
| `avgDailyTime` | number | 예 | 이용자 1명당 일평균 이용시간(분) |
| `segment` | integer | 아니요 | 집계 기준 구간. 다르면 선을 잇지 않는다 |

두 연령대 비교 화면은 새 API 없이 이 응답에서 두 연령대 행을 골라 쓴다.

### 3-2. GET `/profiles/trend?minor=` — 유지
- 입력: `minor`(필수, 중분류 코드), `dataset`
- 응답: `{minorCode, profiles: Row[], continuityBreaks}`. 6개월 × 6개 연령대.
- 빠진 달은 값이 `null`이며 **선으로 잇지 않는다.** `segment`가 다르면 잇지 않는다. 6개월 자료라 "추세"라고 표현하지 않는다.
- 400: `MISSING_PARAMETER`, `INVALID_MINOR`

### 3-3. GET `/explore/ranking` — 유지 (`relativeFrequency` 사용 가능)

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

| basis | 질문 | 값 | 화면 문구 예 |
|---|---|---|---|
| `ageShare` (기본) | 이 분류를 쓰는 사람 중 ○○대가 얼마나 되나 | 이 분류 이용자 중 이 연령대 비중 | "이 분류 이용자 중 30대 비중 28%" |
| `relativeFrequency` | ○○대 이용자는 얼마나 자주 쓰나 | 이 연령대 평균 이용일수 ÷ 기준일수 | "30대 이용자는 연령 간 평균보다 1.5배 자주 사용" |

- `relativeFrequency`는 `metrics.weightedReference=true`일 때만 쓸 수 있다. `false`면 200 + `status=unavailable` + `items=[]`이다(v2 실제 데이터는 `true`).
- 화면에서 두 기준을 탭으로 나눠 "누가 많이 쓰나 / 얼마나 자주 쓰나"로 보여 줄 수 있다.

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
| `excluded[]` | {minorCode, name, reason} | 아니요 | `basis` 값이 `null`이라 뺀 중분류(`minorCode` 순). `reason`은 행의 `status`(`missing`/`suppressed`), 또는 `share_unavailable`(ageShare) / `reference_unavailable`(relativeFrequency) |

규칙
1. 정렬: `value` 내림차순 → `minorCode` 오름차순. 동점은 `ageShare`면 소수 3자리, `relativeFrequency`면 소수 2자리 반올림 값으로 판정한다.
2. `value`가 `null`인 중분류는 0으로 두지 않고 `excluded`에 넣는다.
3. 400: `MISSING_PARAMETER`, `INVALID_AGE_GROUP`, `INVALID_MONTH`, `INVALID_MAJOR`, `INVALID_BASIS`, `INVALID_LIMIT`
4. 화면 문구: "○○대에서 비중이 큰 분류", "○○대 이용자의 이용 빈도가 높은 분류". "○○대가 가장 많이 쓰는"은 쓰지 않는다. `ageShare`는 연령대마다 전체 이용자 규모가 달라 연령대끼리 같은 숫자로 우열을 매기지 않는다.

### 3-4. 파이프라인 산출물 `surveyReference` (설문 매칭 기준값)

Spring은 이 값을 **읽기만** 한다. 구현: `pipeline/appbti_pipeline/reference.py`의 `build_survey_reference`. 문항 설정과 묶지 않도록 **모든 중분류 × 지표**를 내보내고, Spring이 문항의 `minorCode`·`metric`으로 찾아 쓴다. 시간 지표가 꺼져 있으면 `time` 항목은 만들지 않는다.

```json
"surveyReference": {
  "months": ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06"],
  "timeBasis": "used_days",
  "items": [
    {"minorCode": "weather", "metric": "days",
     "values": {"under20": {"logMean": -0.62, "display": 3.8}, "20s": {"logMean": -0.91, "display": 2.8},
                "30s": {"logMean": -0.80, "display": 3.1}, "40s": {"logMean": -0.58, "display": 3.9},
                "50s": {"logMean": -0.41, "display": 4.6}, "60plus": {"logMean": -0.30, "display": 5.2}}},
    {"minorCode": "sns", "metric": "time",
     "values": {"under20": {"logMean": 3.41, "display": 30.2}, "20s": {"logMean": 3.52, "display": 33.8},
                "30s": {"logMean": 3.10, "display": 22.2}, "40s": {"logMean": 2.71, "display": 15.0},
                "50s": {"logMean": 2.45, "display": 11.6}, "60plus": null}}
  ]
}
```

| 필드 | 의미 |
|---|---|
| `months` | 평균에 쓴 달 |
| `timeBasis` | `used_days`(이용한 날 기준, 원본 그대로) / `calendar_days`(그달 전체 일수 기준 → 쓴 날 사용량으로 환산) |
| `values.<ageGroup>.logMean` | **매칭 계산용.** 월별 로그값의 6개월 평균. `days`는 `ln(avgDays ÷ 그 달 실제 일수)`, `time`은 `ln(avgDailyTime)` (`calendar_days`면 `ln(avgDailyTime × 그 달 일수 ÷ avgDays)`) |
| `values.<ageGroup>.display` | **근거 표시용.** `days`는 "일주일에 며칠"(비율 × 7, 기하평균), `time`은 분(기하평균) |

- 한 달이라도 값이 없거나 0 이하이면 그 연령대 값은 `null`이다. 0으로 채우지 않는다.
- 6개월 평균 로그값을 답한 문항으로 다시 중심화한 결과는 "월별 CLR → 6개월 평균"과 같다(같은 선형 연산).

---

## 4. 설문·결과 API (신진용)

### 4-0. v1에서 바뀐 점

| 항목 | v1 | v2 |
|---|---|---|
| 문항 | 12개, "지난달 접속 횟수" | **14개**: 일수 4 ("최근 7일 중 며칠") + 시간 10 (5지선다, "사용한 날, 하루에 보통") |
| 응답 상태 | `answered` / `unknown` / `skipped` | **`answered` / `not_used` / `unknown`** |
| 응답 값 | `count` (0 이상) | **`value`**: 일수 1~7, 시간 선택지 1~5 |
| 매칭 | 코사인, 기준월 1개월 | **CLR + 최근접 중심(유클리드 거리)**, 6개월 기준 |
| 순위 | `score` 0~100 | **`distance`** (작을수록 비슷) |
| 1·2위 근소 | 없음 | **`nearTie`** |
| 패턴 불명확 | 없음 | **`patternClarity`** |
| 근거 | `userCount`, `groupValue`, `normalizedDifference` | **`userValue`, `groupValue`, `unit`, `difference`, `direction`** |
| 또래 비교 | 없음 | **신규**: 선택 입력 `ageGroup` → `peerComparison` (4-3) |
| 최소 비교 수 | 6 | 6 (그대로) |

설정 파일 (실제 데이터)

```yaml
# config/similarity.yaml
enabled: true
method: clr_nearest
minimum_items: 6
clr_scope: answered_items      # 답한 문항만으로 양쪽 중심화
clr_blocks: joint              # 일수·시간을 함께 중심화
time_choice_minutes: [1.7, 5.5, 17.3, 42.4, 84.9]   # 5지선다 구간 대표값(기하 중간값)
days_scale: 7                  # 일수 응답 ÷ 7
near_tie_ratio: 0.05           # (2위 거리 − 1위 거리) ÷ 2위 거리 < 0.05 → 근소
similar_difference: 0.1        # 근거 direction=similar 기준
flat_pattern_ratio: null       # TODO(확인 필요): 패턴 불명확 기준
close_value_ratio: 1.25        # '가까운 항목'은 화면 수치도 이 배수 안이어야 함 (TODO: 우서현 확정)
time_choice_edges: [3, 10, 30, 60]   # 시간 선택지 구간 경계(분). 근거의 집단 시간을 선택지 구간으로 표시할 때 사용 (후자 버전 [15, 30, 45, 90])
```

```yaml
# config/survey_questions.yaml
period: last7days
time_choices: ["잠깐 확인만 해요 (3분 이내)", "10분이 안 돼요 (3~10분)", "10~30분", "30분~1시간", "1시간 이상"]
questions:
  - {id: q01, minor_code: weather, metric: days, enabled: true, text: "최근 7일 중 날씨 앱이나 사이트를 며칠 확인했나요?"}
  - {id: q05, minor_code: portal, metric: time, enabled: true, text: "포털을 사용한 날, 하루에 보통 얼마나 사용하나요?"}
```

**'하루' 기준 두 버전** (LG U+ 확인 후 하나만 남긴다)

| 항목 | 기본 (이용한 날 기준) | 후자 (그달 전체 일수 기준) |
|---|---|---|
| 설정 | `codebook.yaml`, `similarity.yaml`, `survey_questions.yaml` | `codebook.calendar_days.yaml`, `similarity.calendar_days.yaml`, `survey_questions.calendar_days.yaml` |
| 시간 선택지 | 3분 이내 / 3~10분 / 10~30분 / 30분~1시간 / 1시간 이상 | 15분이 안 돼요 / 15~30분 / 30~45분 / 45분~1시간 30분 / 1시간 30분 이상 |
| 계산용 대표 분 | 1.7, 5.5, 17.3, 42.4, 84.9 | 8.7, 21.2, 36.7, 63.6, 127.3 |

- 후자 버전은 Spring 코드 변경 없이 설정 경로만 바꿔 실행한다: `APPBTI_SIMILARITY_PATH=../config/similarity.calendar_days.yaml APPBTI_SURVEY_QUESTIONS_PATH=../config/survey_questions.calendar_days.yaml`
- API 형식은 두 버전이 같다. 선택지 문구와 계산 기준값만 다르다.

### 4-1. GET `/survey/questions` — 변경

예시: [examples/survey_questions.json](examples/survey_questions.json)

문항 ID 고정표

| ID | minorCode | 이름 | metric |
|---|---|---|---|
| q01 | `weather` | 날씨 | days |
| q02 | `portal` | 포털 | days |
| q03 | `webtoon` | 웹툰 | days |
| q04 | `game` | 게임 | days |
| q05 | `portal` | 포털 | time |
| q06 | `sns` | SNS | time |
| q07 | `ott` | OTT | time |
| q08 | `music` | 음악 | time |
| q09 | `webtoon` | 웹툰 | time |
| q10 | `game` | 게임 | time |
| q11 | `specialty_mall` | 전문쇼핑몰 | time |
| q12 | `mobile_bank` | 모바일 은행 | time |
| q13 | `online_stock` | 온라인 증권거래 | time |
| q14 | `land_transport` | 기차·고속버스 | time |

TODO(확인 필요): q02를 전문쇼핑몰 일수로 바꾸는 안(모의 설문에서 구분 점검 비율이 조금 높음).

| 필드 | 타입 | null | 의미 |
|---|---|---|---|
| `period` | string | 예 | `last7days`. 설정 파일이 없으면 `null` |
| `questions[]` | object[] | 아니요 | **활성 문항만**, `id` 순. 시간 지표가 꺼져 있으면 `time` 문항은 빠진다 |
| `questions[].id` | string | 아니요 | `q01`… |
| `questions[].minorCode`, `name`, `major` | string | 아니요 | 연결된 중분류(코드북 기준) |
| `questions[].metric` | string | 아니요 | `days` / `time`. 화면이 `answerFormats`에서 입력 형식을 고르는 키 |
| `questions[].text` | string | 아니요 | 질문 문구. 앱 이름은 예시일 뿐이다 |
| `questions[].guide` | string | 예 | 혼동 방지 안내 |
| `answerFormats.days` | object | 아니요 | `{min: 1, max: 7, unit: "일", allowNotUsed, allowUnknown}`. 미리 선택된 값을 두지 않는다 |
| `answerFormats.time.choices[]` | {value, label} | 아니요 | 5지선다. **계산용 대표 분은 보내지 않는다**(서버 설정에만 있음) |
| `minimumItems` | integer | 아니요 | 최소 비교 문항 수(6) |
| `comparisonEnabled` | boolean | 아니요 | 설문 비교 켜짐 그리고 `surveyReference`가 있음. `false`면 결과 대신 탐색 안내 |
| `timeAvailable` | boolean | 아니요 | 시간 문항을 내보내는지 |

- 모든 문항에 "사용 안 함"·"잘 모르겠음" 버튼을 둔다.
- 삭제: `month`, `maxDays`, `minimumCategories`, `zeroDaysPolicy`, `answerFormat`(단일) → `answerFormats`(형식별)

### 4-2. POST `/survey/result` — 변경

예시: [examples/survey_result.json](examples/survey_result.json), [examples/survey_result_insufficient.json](examples/survey_result_insufficient.json)

#### 요청

```json
{
  "ageGroup": "30s",
  "answers": [
    {"questionId": "q01", "status": "answered", "value": 5},
    {"questionId": "q05", "status": "answered", "value": 4},
    {"questionId": "q13", "status": "not_used", "value": null},
    {"questionId": "q11", "status": "unknown",  "value": null}
  ]
}
```

| 필드 | 타입 | null | 의미 |
|---|---|---|---|
| `ageGroup` | string | 예 | **선택.** 사용자가 직접 고른 자기 연령대. 있으면 또래 비교(4-3)를 만든다. **매칭 순위에는 쓰지 않고, 서버에 저장하지 않는다** |
| `answers[].questionId` | string | 아니요 | `/survey/questions`의 `id` |
| `answers[].status` | string | 아니요 | `answered` / `not_used` / `unknown` |
| `answers[].value` | integer | 예 | `answered`면 `days` 문항은 1~7, `time` 문항은 1~5. 그 밖에는 `null` |

- 답하지 않은 문항은 `answers`에서 빠져도 된다(`unknown`과 같게 처리).
- 400: `MALFORMED_JSON`, `UNKNOWN_QUESTION`(없는·비활성 문항), `DUPLICATE_QUESTION`, `INVALID_STATUS`, `INVALID_VALUE`(`answered`인데 `value`가 `null`·범위 밖, `answered`가 아닌데 `value`가 있음), `INVALID_AGE_GROUP`

#### 계산

1. **제외**: `not_used`, `unknown`, 그리고 6개 연령대 중 기준값이 `null`인 문항 → `excluded`
2. **개수 확인**: 남은 문항 `k`가 `minimum_items`(6) 미만이면 `status=insufficient`
3. **값 변환**: `days`는 `x = value ÷ 7`, `time`은 `x = time_choice_minutes[value − 1]`
4. **로그**: `q_i = ln(x_i)`, 연령대 `a`는 `g_a,i = logMean(a, i)`
5. **CLR (답한 문항만, 일수·시간 함께)**: `q'_i = q_i − mean(q)`, `g'_a,i = g_a,i − mean(g_a)`
6. **거리**: `d_a = √Σ_i (q'_i − g'_a,i)²`
7. **순위**: `d_a`를 소수 3자리로 반올림해 오름차순, 경쟁 순위
8. **근소**: `(d_2위 − d_1위) ÷ d_2위 < near_tie_ratio` → `nearTie.isNear = true`
9. **패턴 불명확**: TODO(확인 필요). `flat_pattern_ratio`가 `null`이면 항상 `clear`
10. **근거**: 근거 연령대와 문항별 `|q'_i − g'_a,i|`. 근거 연령대는 요청에 `ageGroup`이 있으면 **그 연령대**, 없으면 1위 연령대(공동이면 `/meta.ageGroups` 순 첫 집단)다. 순위·1위는 `ageGroup`과 무관하다
    - `closest`: CLR 차이가 작은 절반 안에 있고 화면 수치도 `close_value_ratio`배 안인 문항을 CLR 차이 오름차순으로 최대 3개 → `closestMode=similar`. 그런 문항이 없으면 CLR 차이 오름차순 3개 → `closestMode=values`
    - 화면은 `similar`면 수치 막대, `values`면 점 두 개 막대(상대 비중)로 보여 준다
    - `farthest`: `closest`를 뺀 나머지에서 내림차순 → `questionId` 순 최대 3개
11. **또래 비교**: 요청에 `ageGroup`이 있으면 4-3 규칙으로 `peerComparison`을 만든다

#### 응답

| 필드 | 타입 | null | 의미 |
|---|---|---|---|
| `status` | string | 아니요 | `comparable` / `insufficient` |
| `reasonCode`, `reason` | string | 예 | 비교 불가 이유. `comparable`이면 `null` |
| `method` | string | 아니요 | `clr_nearest` |
| `referenceMonths` | string[] | 아니요 | 기준 기간 `[시작월, 끝월]` |
| `answeredCount` | integer | 아니요 | `answered` 응답 수 |
| `comparedItems` | integer | 아니요 | 실제 비교한 문항 수 `k` |
| `minimumItems` | integer | 아니요 | 최소 비교 수 |
| `rankings[]` | {ageGroup, label, rank, distance, isTied} | 아니요 | 6개 연령대 전체, 거리 오름차순. `distance`는 소수 3자리, **작을수록 비슷함.** 화면에는 숫자 대신 순위 표시를 권장 |
| `matches[]` | {id, label} | 아니요 | 1위(공동이면 모두) |
| `nearTie` | {isNear, second, gapRatio} | 예 | `insufficient`이면 `null` |
| `patternClarity` | string | 예 | `clear` / `weak`. `insufficient`이면 `null` |
| `evidenceGroup` | {id, label} | 예 | 근거를 계산한 집단. 요청에 `ageGroup`이 있으면 그 연령대 |
| `overallRatio` | number | 예 | 근거 연령대 대비 응답 전체 크기(기하평균 배수). 측정 방식 차이가 섞여 있어 **화면에 표시하지 않는다** |
| `closestMode` | string | 예 | `similar`(수치까지 가까운 항목) / `values`(상대 비중만 가까운 항목) |
| `patternMap` | object | 예 | 응답 패턴 지도: `{points: [{id, label, x, y, isUser, distance}], explained}`. 6개 연령대 CLR 패턴의 주성분 2개 축에 나를 투영한 좌표(-1~1). `distance`는 나와 그 연령대 거리에서 모든 연령대에 똑같이 더해지는 부분을 뺀 값(순서가 순위와 같음). `explained`는 연령대 차이 중 지도 2축에 담긴 비율. 화면은 방향은 좌표를, 나와의 거리는 `distance`를 써서 그린다(지도 순서 = 순위) |
| `closest[]`, `farthest[]` | object[] | 아니요 | 닮은 항목·다른 항목 각각 최대 3개, 서로 겹치지 않음 |
| `…[].questionId`, `minorCode`, `name`, `metric` | string | 아니요 | 문항 |
| `…[].userValue` | number | 아니요 | 내 값. `days`는 일(1~7), `time`은 선택지 대표 분 |
| `…[].groupValue` | number | 아니요 | `evidenceGroup`의 `display` 값 (같은 단위) |
| `…[].unit` | string | 아니요 | `일` / `분` |
| `…[].difference` | number | 아니요 | `|q'_i − g'_a,i|`, 소수 2자리. 작을수록 비슷함 |
| `…[].direction` | string | 아니요 | `more`(내가 상대적으로 더 씀) / `less` / `similar`(`difference` < 0.1) |
| `…[].relativeRatio` | number | 아니요 | `exp(q'_i − g'_a,i)`. 1보다 크면 더, 작으면 덜 치우침 |
| `…[].userRelative`, `groupRelative` | number | 아니요 | 점 두 개 막대 위치. 나·근거 연령대의 CLR 값을 같은 지표(일수·시간) 안에서 근거 연령대 평균 기준으로 옮긴 배수. 두 값의 비가 `relativeRatio` |
| `…[].userChoice`, `userLabel` | integer, string | 예 | 시간 문항만: 내가 고른 선택지 번호·문구. 일수 문항은 `null` |
| `…[].groupChoice`, `groupLabel` | integer, string | 예 | 시간 문항만: 집단 시간이 속한 선택지 구간(`time_choice_edges` 기준). 경계 설정이 없으면 `null` |
| `excluded[]` | {questionId, minorCode, name, reason} | 아니요 | 비교에서 뺀 문항. `reason`: `not_used` / `unknown` / `group_missing` |
| `peerComparison` | object | 예 | 또래 비교(4-3). `ageGroup`이 없거나 비교 문항이 6개 미만이면 `null` |
| `resultType` | {name, description, status} | 아니요 | 결과 유형 이름. 지금은 `status: pending` |
| `nextAction` | {path, label, message} | 예 | 비교 불가일 때 `{"path": "/explore", …}` |
| `isMock`, `source` | boolean, string | 아니요/예 | `/meta`와 같음 |

`reasonCode`: `comparison_disabled`(비교 꺼짐 또는 `surveyReference` 없음), `too_few_items`(비교 가능한 문항이 6개 미만)

규칙
1. `insufficient`이면 `rankings`, `matches`, `closest`, `farthest`는 `[]`, `nearTie`·`patternClarity`·`evidenceGroup`은 `null`이다. 거리를 0으로 채우지 않는다.
2. 화면 문구: `matches` → "전체 응답 패턴은 ○○ 집단의 통계와 가장 가까워요", `nearTie.isNear` → "○○대와도 비슷합니다", `patternClarity=weak` → "응답 패턴이 뚜렷하지 않아요".
3. `direction`은 CLR 기준이라 "자기 평소 대비 그 앱에 더 치우쳐 있다"는 뜻이다. "○분 더 쓴다"처럼 절대량으로 말하지 않는다.
4. 결과는 **과거 제공 기간의 이용자 집단 통계와 응답 패턴을 비교한 것**이다. 실제 나이 추정이나 개인 기록 분석처럼 쓰지 않는다.
5. v1에서 삭제된 필드: `month`(요청·응답), `rankings[].score`, `closest[].userCount`, `normalizedDifference`, `comparedCategories`, `minimumCategories`

### 4-3. 또래 비교 `peerComparison` — 신규

사용자가 **직접 고른** 연령대의 이용자 통계와 응답을 **상대적으로** 비교해, 다른 앱보다 어느 쪽으로 더·덜 치우쳐 쓰는지와 가벼운 제안 문장 하나를 보여 준다.

- **연령 추정이 아니다.** 사용자가 고른 연령대를 그대로 쓴다.
- **상대 비교(CLR)만 한다.** LG U+ 집계와 자기보고는 측정 방식이 달라 절대 수준이 맞지 않을 수 있으므로 "○배 많이 써요"는 만들지 않는다.
- **매칭 순위에 쓰지 않고, 저장하지 않는다.**

계산
1. 대상 문항: 매칭에 쓴 문항과 같다(`k`개)
2. 사용자 CLR `q'_i`, 고른 연령대 CLR `g'_i`: 매칭 5단계와 같은 값
3. 문항별 상대 배수 `relativeRatio_i = exp(q'_i − g'_i)` (소수 2자리)
4. `relativeRatio ≥ more_ratio`(1.5) → `more`, `≤ less_ratio`(0.67) → `less`, 그 사이는 보여 주지 않음
5. `more`·`less` 각각 `|ln relativeRatio|` 내림차순 → `questionId` 순 최대 `max_items`(2)개
6. `suggestion`: `more` 중 `suggest_reduce: true`인 분야에서 `relativeRatio`가 가장 큰 1개. 없으면 `null`
7. `matchesStated`: 매칭 1위에 고른 연령대가 들어 있으면 `true`
8. `statedDiffers`: `matchesStated=false`일 때 서버가 `stated_differs` 템플릿으로 채운 문장. 1위가 공동이면 `{match}`에 공동 1위를 `·`로 이어 넣는다. `true`면 `null`

설정: `config/peer_messages.yaml` (`more_ratio`, `less_ratio`, `max_items`, 문장 템플릿 `templates`(`more`, `less`, `stated_differs`, `note`), 분야별 제안 여부 `categories`)

| 필드 | 타입 | null | 의미 |
|---|---|---|---|
| `ageGroup` | {id, label} | 아니요 | 사용자가 고른 연령대 |
| `comparedItems` | integer | 아니요 | 또래 비교에 쓴 문항 수 |
| `more[]`, `less[]` | object[] | 아니요 | 최대 2개씩. 없으면 `[]` |
| `…[].questionId`, `minorCode`, `name`, `metric` | string | 아니요 | 문항 |
| `…[].relativeRatio` | number | 아니요 | 상대적 치우침의 배수 (1보다 크면 더, 작으면 덜). **화면 문장에 숫자로 넣지 않는다** |
| `…[].message` | string | 아니요 | 템플릿 문장 |
| `suggestion` | {questionId, message} | 예 | 제안 문장 1개. 해당 분야가 없으면 `null` |
| `matchesStated` | boolean | 아니요 | 매칭 1위에 고른 연령대가 있는지 (화면 분기용) |
| `statedDiffers` | string | 예 | `matchesStated=false`일 때 서버가 채운 안내 문장("응답 패턴은 50대 통계와 가장 비슷해요. 고른 연령대(30대) 통계와는 차이가 있어요."). 화면은 그대로 보여 주고 직접 만들지 않는다. `true`면 `null` |
| `note` | string | 아니요 | 출처·한계 안내 문장 |

문구 규칙: 템플릿에서 이름 뒤에 조사를 붙이지 않는다(받침에 따라 틀림). "**응답하셨어요**"(실제 이용 기록처럼 보이지 않게), "**○○대 이용자 통계**"(이용자만의 평균). 제안은 "어떨까요?" 한 문장만 쓰고, 생활·정보·금융 분야는 제안하지 않는다. AI 생성 문장을 쓰지 않는다(템플릿만).

---

## 5. GET `/explore/signals` — 꺼짐 (발표 범위 제외)

**이 달의 특이 신호**(그 달·그 연령대에서 나머지 5개월보다 확실히 크게 달라진 분야)는 구현했지만, 6개월 자료로는 근거가 부족해 **11/20 팀 결정으로 발표 범위에서 제외**했다.

- `config/codebook.yaml`의 `monthly_signals.enabled: false` → 산출물에 `monthlySignals`가 없다.
- API는 남아 있고, 호출하면 200 + `{"status": "unavailable", "signals": [], "message": "특이 신호를 준비하지 못했어요."}`를 돌려준다. **화면에서 호출하지 않는다.**
- 다시 켜려면 `enabled: true`로 바꾸고 파이프라인을 다시 돌린다. 판정 산식은 `pipeline/appbti_pipeline/reference.py`의 `build_monthly_signals`와 코드북 주석에 있다.

---

## 6. 테스트 기준 (가상 값만)

| 대상 | 테스트 |
|---|---|
| `surveyReference`, `monthlySignals` | `pipeline/tests/test_reference.py` |
| 기준일수·구성비 | `pipeline/tests/test_profiles.py` |
| CLR 매칭·또래 비교 | `backend/.../ClrMatcherTests` (기대 거리·배수는 Python으로 따로 계산한 가상 값) |
| API 형식·오류 코드 | `backend/.../ApiV2ControllerTests` |
| 특이 신호 필터·정렬 | `backend/.../ExploreSignalsTests` |

설문 결과에서 확인하는 사례: 정상 14문항, 미응답 섞임, 5문항만 답함(`insufficient`), 모든 답에 같은 배수(순위 불변), 1·2위 근소, 기준값 `null`인 연령대(`group_missing`), 같은 입력 반복, 형식 오류(400), `ageGroup` 유무에 따라 매칭 결과가 같은지.

---

## 7. 담당별 체크리스트

**신진용 (meta, questions, result)**
- [x] v2 구현 (임기범이 PR #25에서 초안 구현: `ClrMatcher`, `PeerMessages`, `SurveyQuestions`, `ApiErrors`)
- [ ] 구현 검토·인계 (PR #25는 리뷰 없이 머지됨)
- [ ] 목업 v2 전환 확인 (`similarity.mock.yaml`, `survey_questions.mock.yaml`, `SurveyQuestions.forData`)
- [ ] LG U+ '하루' 기준 재확인

**임기범 (profiles, trend, ranking + 파이프라인 산식)**
- [x] `surveyReference` 산출, 기준일수 켬
- [x] 오류 본문 `{status, code, message}`
- [ ] q02 교체 반영 (팀 결정 후)
- [ ] '하루' 기준 확정 후 한 버전만 남기기

**우서현·차현우 (파이프라인 검증·신뢰성 검토)**
- [ ] 각자 원본으로 정제·산출물 재현 확인
- [ ] 문항 문구, 시간 선택지 문구, 또래 비교 기준값·문장, 결과 유형 이름 확정 (우서현)
- [ ] 기준일수 산식 검토 (우서현)

**심유진 (화면)**
- [ ] 설문: `metric`별 입력(일수 1~7, 시간 5지선다), "사용 안 함"·"잘 모르겠음"
- [ ] 결과: 1위 + 근소 시 2위, 닮은·다른 항목(단위 표시), 비교 불가 시 탐색 안내, 거리 숫자는 크게 보이지 않기
- [ ] 결과: 「내 연령대 선택(선택 사항)」 → 또래 비교 카드, 제안 1개, `note` 출처 문구
- [ ] 탐색 랭킹: `basis` 선택(구성비 / 자주 쓰는 정도)
- [ ] `frontend/src/api/types.ts`를 v2 형식으로 변경

---

## 8. TODO(확인 필요)

- **일평균 이용시간의 '하루' 기준**(이용한 날 / 그달 전체 일수): LG U+에 예시로 다시 묻는다("10일 동안 하루 30분씩 쓴 사람은 30분인가요, 10분인가요?"). 답에 맞춰 한 버전만 남긴다.
- **q02 교체**(포털 일수 → 전문쇼핑몰 일수).
- **패턴 불명확 기준** `flat_pattern_ratio`, **`similar` 기준값**(0.1).
- **또래 비교 기준값·문구**: `more_ratio`(1.5), `less_ratio`(0.67), 분야별 제안 여부.
- **결과 유형 이름**(`resultType`).
- **카테고리 정의**: 전문쇼핑몰, 모바일 은행, 증권, 기차·고속버스, 포털에 포함되는 앱(질문 예시 앱 이름용).
