# API 명세 v2 초안 (14문항 · CLR 매칭)

> **초안이다.** 확정 계약은 여전히 [API.md](API.md)(v1)다. 설문·결과 API 담당(신진용)과 합의한 뒤 `API.md`에 반영한다.
> 이 문서의 모든 수치는 **직접 만든 가상 값**이다. 실제 LG U+ 수치를 넣지 않는다.

- 기준: 로컬 분석에서 정한 최신 14문항(일수 4 + 시간 10)과 CLR + 최근접 중심 매칭
- 모든 경로는 `/api` 기준이다. 서버는 설문 응답을 저장하지 않는다.
- 상태 표시: **유지**(v1 그대로) / **변경**(v1에서 수정) / **신규**

### 지표 정의 (고정)

v2는 **LG U+ 답변**을 기준으로 지표 정의를 고정한다. 현재 `config/codebook.yaml`의 `real_analysis.metric_definitions`(월간·일평균 "접속 횟수" 가정)는 v2에서 따르지 않는다.

| 원본 컬럼 | 내부 필드 | v2 정의 | v2에서 쓰는 방식 |
|---|---|---|---|
| `AVG_TADV_DAYS` | `avgDays` | **이용자 1명당 월 평균 이용일수** (분모: 그 연령대·분류의 이용자 수) | `avgDays ÷ 그 달 실제 일수` → 이용일 비율. 설문 "최근 7일 중 며칠 ÷ 7"과 같은 단위 |
| `AVG_ASMP_VSIT_TM` | `avgDailyTime` | **이용자 1명당 일평균 이용시간 (분)** | 분 그대로. 설문 5지선다의 구간 대표 분과 비교 |
| `UNQ_USER_CNT` | `uu` | 월간 유니크 이용자 수 | 매칭에 쓰지 않음. 구성비(`ageShare`)는 탐색 화면에서만 |

- 두 지표 모두 **이용자 기준 평균**이다. 그래서 "사용 안 함" 응답은 비교에서 뺀다.
- 일평균 이용시간의 하루 기준(이용한 날 / 달력 일수)은 아직 확인 중이며, 질문 문구에만 영향을 준다(8장 TODO).

## 0. 한눈에 보기

| 메서드·경로 | 담당 | v1 대비 | 쓰는 화면 |
|---|---|---|---|
| GET `/meta` | 임기범 | **변경** (`survey` 필드 값) | 공통, 홈 소개 문구 |
| GET `/profiles?month=` | 임기범 | 유지 | 탐색(두 연령대 비교) |
| GET `/profiles/trend?minor=` | 임기범 | 유지 | 탐색(월별 추이) |
| GET `/explore/ranking` | 임기범 | 유지 | 탐색(연령대별 랭킹) |
| GET `/explore/signals` | 임기범 | **신규** | 탐색(이 달의 특이 신호) |
| GET `/survey/questions` | 신진용 | **변경** | 설문 |
| POST `/survey/result` | 신진용 | **변경** | 결과 |

API가 아닌 변경도 함께 필요하다.

| 대상 | 내용 | 담당 |
|---|---|---|
| 파이프라인 산출물 | 시간 지표 켜기(`avgDailyTime`, 분) + `surveyReference` 추가 (3장) | 임기범 · 우서현 |
| 파이프라인 산출물 | `monthlySignals` 추가 (5장) | 임기범 · 우서현 |
| `config/survey_questions.yaml` | 14문항, `metric: days / time` | 우서현 · 신진용 |
| `config/similarity.yaml` | `method: clr_nearest` 등 (4-0) | 신진용 |
| `config/peer_messages.yaml` | 또래 비교 기준값·문장 템플릿·분야별 톤 (4-3) | 신진용 (문구: 우서현) |

### 화면별 호출 순서

1. 앱 시작: `GET /meta`
2. 설문: `GET /survey/questions` → 응답 모으기 → `POST /survey/result`
3. 결과: 2번 응답 하나로 화면 전체를 그린다(추가 호출 없음)
4. 탐색: `GET /explore/ranking` + `GET /profiles/trend` + (두 연령대 비교 시) `GET /profiles`
5. 탐색 「이 달의 특이 신호」 탭: `GET /explore/signals?month=&ageGroup=` (**신규**)

### 전체 흐름

```
[파이프라인, 서버 시작 전]  원본 → 월별 일수 비율·이용시간 → 연령대 × 문항 "6개월 평균 로그값" → profiles.json
[Spring 시작]             profiles.json, survey_questions.yaml, similarity.yaml 적재
[POST /survey/result]     검사 → 미응답 제외 → 6문항 확인 → 값 변환 → 로그 → 답한 문항으로 양쪽 CLR
                          → 6개 연령대와 유클리드 거리 → 순위 → 근소·불명확 판정 → 근거 → 응답
```

- 무거운 계산(월별 비율, 6개월 평균, 로그)은 **Python 파이프라인**에서 한다(AGENTS.md 4장).
- Spring은 응답마다 **평균 빼기와 거리 계산만** 한다. 답한 문항 묶음이 사람마다 달라서 CLR을 미리 저장할 수 없다.

---

## 1. 공통 규칙 — 유지

v1 1장(`dataset`, 결측 `null`, HTTP 상태와 오류 형식, 정렬과 동점, 화면 문구)을 그대로 따른다. 달라지는 점만 적는다.

- **동점**: 설문 결과의 순위는 `distance`를 **소수 3자리로 반올림한 값**으로 판정한다(1-4의 "화면에 보이는 반올림 값" 원칙).
- **화면 문구 추가 금지**: 거리나 순위를 "확률", "정확도", "일치율"로 부르지 않는다.
- **오류 본문** (구현됨): 모든 오류는 `{"status": 400, "code": "INVALID_MONTH", "message": "제공하지 않는 기준월입니다."}` 형식이다. 비교 불가(`insufficient`)·신호 없음(`unavailable`)은 오류가 아니라 200이다.

| 상태 | `code` |
|---|---|
| 400 | `MISSING_PARAMETER`, `INVALID_MONTH`, `INVALID_AGE_GROUP`, `INVALID_MINOR`, `INVALID_MAJOR`, `INVALID_BASIS`, `INVALID_TYPE`, `INVALID_METRIC`, `INVALID_LIMIT`, `MALFORMED_JSON`, `UNKNOWN_QUESTION`, `DUPLICATE_QUESTION`, `INVALID_STATUS`, `INVALID_VALUE` |
| 404 | `DATASET_NOT_FOUND`, `NOT_FOUND`(없는 경로) |
| 405 / 415 | `METHOD_NOT_ALLOWED` / `UNSUPPORTED_MEDIA_TYPE` |
| 500 | `INTERNAL_ERROR` |
| 503 | `PROFILES_UNAVAILABLE`, `SURVEY_UNAVAILABLE` |

---

## 2. GET `/meta` — 변경 (`survey` 필드 값만)

필드 구조는 v1과 같다. `survey`의 값과 의미만 바뀐다.

| 필드 | v1 | v2 |
|---|---|---|
| `survey.questionCount` | 활성 문항 수(12) | 활성 문항 수(**14**) |
| `survey.period` | `monthly` | **`last7days`** (일수 문항 기준 기간) |
| `survey.method` | `cosine` | **`clr_nearest`** |
| `survey.timeAvailable` | 없음 | **신규** boolean. 시간 문항 사용 여부 |
| `metrics.dailyTime`, `metrics.timeComparable` | `false` | 시간 문항을 켜면 `true` (TODO: LG U+ 하루 기준 확인) |

---

## 3. 파이프라인 산출물 추가: `surveyReference`

Spring은 이 값을 **읽기만** 한다. 지표를 다시 계산하지 않는다.

**구현 완료**: `pipeline/appbti_pipeline/reference.py`의 `build_survey_reference`. 설문 문항 설정과 묶지 않도록 **모든 중분류 × 지표**(104 × 2 = 208개)를 내보내고, Spring이 문항의 `minorCode`·`metric`으로 찾아 쓴다. 시간 지표(`metrics.dailyTime`)가 꺼져 있으면 `time` 항목은 만들지 않는다.

```json
"surveyReference": {
  "months": ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06"],
  "items": [
    {
      "minorCode": "weather",
      "metric": "days",
      "values": {
        "under20": {"logMean": -0.62, "display": 3.8},
        "20s":     {"logMean": -0.91, "display": 2.8},
        "30s":     {"logMean": -0.80, "display": 3.1},
        "40s":     {"logMean": -0.58, "display": 3.9},
        "50s":     {"logMean": -0.41, "display": 4.6},
        "60plus":  {"logMean": -0.30, "display": 5.2}
      }
    },
    {
      "minorCode": "sns",
      "metric": "time",
      "values": {
        "under20": {"logMean": 3.41, "display": 30.2},
        "20s":     {"logMean": 3.52, "display": 33.8},
        "30s":     {"logMean": 3.10, "display": 22.2},
        "40s":     {"logMean": 2.71, "display": 15.0},
        "50s":     {"logMean": 2.45, "display": 11.6},
        "60plus":  {"logMean": null, "display": null}
      }
    }
  ]
}
```

| 필드 | 타입 | null | 의미 |
|---|---|---|---|
| `months` | string[] | 아니요 | 평균에 쓴 달 |
| `items[].minorCode` | string | 아니요 | `codebook.yaml` 중분류 코드. 문항 연결은 Spring이 `survey_questions.yaml`의 `minor_code`·`metric`으로 한다 |
| `items[].metric` | string | 아니요 | `days` / `time` |
| `values.<ageGroup>.logMean` | number | 예 | **매칭 계산용.** 월별 값의 로그를 6개월 평균한 값. `days`는 `ln(평균 이용일수 ÷ 그 달 실제 일수)`, `time`은 `ln(일평균 이용시간(분))` |
| `values.<ageGroup>.display` | number | 예 | **근거 표시용.** `days`는 "일주일에 며칠"(비율 × 7, 기하평균), `time`은 분(기하평균) |

규칙
1. 한 달이라도 값이 없거나 0 이하이면 그 연령대의 `logMean`·`display`는 `null`이다. 0으로 채우지 않는다.
2. 6개월 평균 로그값을 쓰면, Spring에서 답한 문항으로 다시 중심화한 결과가 "월별 CLR → 6개월 평균"과 같다(평균과 중심화의 순서를 바꿔도 같은 선형 연산).

---

## 4. 설문·결과 API (신진용)

### 4-0. v1에서 바뀐 점

| 항목 | v1 | v2 |
|---|---|---|
| 문항 | 12개, "지난달 접속 횟수" | **14개**: 일수 4 ("최근 7일 중 며칠") + 시간 10 (5지선다) |
| 응답 상태 | `answered` / `unknown` / `skipped` | **`answered` / `not_used` / `unknown`** (`skipped`는 `unknown`과 같게 처리) |
| 응답 값 | `count` (0 이상, 상한 없음) | **`value`**: 일수 1~7, 시간 선택지 1~5 |
| 매칭 | 코사인, 기준월 1개월 | **CLR + 최근접 중심(유클리드 거리)**, 6개월 기준 |
| 순위 | `score` 0~100 | **`distance`** (작을수록 비슷) |
| 1·2위 근소 | 화면에서 판단(TODO) | **`nearTie`** 필드로 서버가 판정 |
| 패턴 불명확 | 없음 | **`patternClarity`** 신규 |
| 근거 | `userCount`, `groupValue`, `normalizedDifference` | **`userValue`, `groupValue`, `unit`, `difference`, `direction`** |
| 시간 문항 | 끔 | **켬** |
| 최소 비교 수 | 6 | 6 (그대로) |
| 또래 비교 | 없음 | **신규**: 선택 입력 `ageGroup` → `peerComparison` (4-3) |

설정 파일

```yaml
# config/similarity.yaml (실제 데이터)
enabled: true
method: clr_nearest
minimum_items: 6
clr_scope: answered_items      # 답한 문항만으로 양쪽 중심화
clr_blocks: joint              # 일수·시간을 함께 중심화
time_choice_minutes: [1.7, 5.5, 17.3, 42.4, 84.9]   # 5지선다 구간 대표값(기하 중간값)
days_scale: 7                  # 일수 응답 ÷ 7
near_tie_ratio: 0.05           # (2위 거리 − 1위 거리) ÷ 2위 거리 < 0.05 → 근소
flat_pattern_ratio: null       # TODO(확인 필요): 패턴 불명확 기준
types: []
```

```yaml
# config/survey_questions.yaml
period: last7days
questions:
  - id: q01
    minor_code: weather          # codebook.yaml과 같아야 함
    metric: days
    enabled: true
    text: "최근 7일 중 날씨 앱이나 사이트를 며칠 확인했나요?"
  - id: q05
    minor_code: sns
    metric: time
    enabled: true
    text: "SNS(인스타그램, 페이스북 등)를 하루에 보통 얼마나 사용하나요?"
```

목업(`similarity.mock.yaml`)은 지금 방식을 그대로 두고, 계산기는 `method` 값으로 방식을 고른다.

### 4-1. GET `/survey/questions` — 변경

문항 ID 고정표 (예시 JSON과 테스트는 이 표를 따른다)

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

```json
{
  "period": "last7days",
  "questions": [
    {"id": "q01", "minorCode": "weather", "name": "날씨", "major": "뉴스/정보", "metric": "days",
     "text": "최근 7일 중 날씨 앱이나 사이트를 며칠 확인했나요?", "guide": null},
    {"id": "q06", "minorCode": "sns", "name": "소셜네트워킹", "major": "온라인서비스", "metric": "time",
     "text": "SNS(인스타그램, 페이스북 등)를 하루에 보통 얼마나 사용하나요?", "guide": null}
  ],
  "answerFormats": {
    "days": {"min": 1, "max": 7, "unit": "일", "allowNotUsed": true, "allowUnknown": true},
    "time": {
      "choices": [
        {"value": 1, "label": "잠깐 확인만 해요 (3분 이내)"},
        {"value": 2, "label": "10분이 안 돼요 (3~10분)"},
        {"value": 3, "label": "10~30분"},
        {"value": 4, "label": "30분~1시간"},
        {"value": 5, "label": "1시간 이상"}
      ],
      "allowNotUsed": true, "allowUnknown": true
    }
  },
  "minimumItems": 6,
  "comparisonEnabled": true,
  "timeAvailable": true
}
```

| 필드 | 타입 | null | 의미 |
|---|---|---|---|
| `period` | string | 아니요 | `last7days` |
| `questions[]` | object[] | 아니요 | **활성 문항만**, `id` 순. 같은 카테고리의 일수·시간 문항은 붙여서 배치 |
| `questions[].id` | string | 아니요 | `q01`… |
| `questions[].minorCode`, `name`, `major` | string | 아니요 | 연결된 중분류(코드북 기준) |
| `questions[].metric` | string | 아니요 | `days` / `time`. 화면이 `answerFormats`에서 입력 형식을 고르는 키 |
| `questions[].text` | string | 아니요 | 질문 문구. 앱 이름은 예시일 뿐이다 |
| `questions[].guide` | string | 예 | 혼동 방지 안내 |
| `answerFormats.days` | object | 아니요 | 1~7 선택 + "사용 안 함" + "잘 모르겠음". 미리 선택된 값을 두지 않는다 |
| `answerFormats.time.choices[]` | {value, label} | 아니요 | 5지선다. **계산용 대표 분은 보내지 않는다**(서버 설정에만 있음) |
| `minimumItems` | integer | 아니요 | 최소 비교 문항 수(6) |
| `comparisonEnabled` | boolean | 아니요 | `false`면 결과 대신 탐색 안내 |
| `timeAvailable` | boolean | 아니요 | 시간 문항 사용 여부 |

삭제: `answerFormat`(단일) → `answerFormats`(형식별), `zeroCountPolicy` → 없음("사용 안 함"은 `not_used` 상태로 받는다).

### 4-2. POST `/survey/result` — 변경

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
| `ageGroup` | string | 예 | **신규, 선택.** 사용자가 직접 고른 자기 연령대(`/meta.ageGroups[].id`). 있으면 또래 비교(4-3)를 만든다. **매칭 순위에는 쓰지 않고, 서버에 저장하지 않는다** |
| `answers[].questionId` | string | 아니요 | `/survey/questions`의 `id` |
| `answers[].status` | string | 아니요 | `answered` / `not_used` / `unknown` |
| `answers[].value` | integer | 예 | `answered`면 `days` 문항은 1~7, `time` 문항은 1~5. 그 밖에는 `null` |

- 답하지 않은 문항은 `answers`에서 빠져도 된다(`unknown`과 같게 처리).
- v1의 `month` 입력은 없앤다. 기준은 항상 산출물의 `surveyReference.months`(6개월)다.

**400이 되는 경우**: 없는·비활성 문항, 같은 문항 중복, `status` 오타, `answered`인데 `value`가 `null`·소수·범위 밖, `answered`가 아닌데 `value`가 있음, 없는 `ageGroup`

#### 계산

1. **제외**: `not_used`, `unknown`, 그리고 6개 연령대 중 `logMean`이 `null`인 문항 → `excluded`
2. **개수 확인**: 남은 문항 `k`가 `minimum_items`(6) 미만이면 `status=insufficient`
3. **값 변환**: `days`는 `x = value ÷ 7`, `time`은 `x = time_choice_minutes[value − 1]`
4. **로그**: `q_i = ln(x_i)`, 연령대 `a`는 `g_a,i = logMean(a, i)`
5. **CLR (답한 문항만, 일수·시간 함께)**: `q'_i = q_i − mean(q)`, `g'_a,i = g_a,i − mean(g_a)` (평균은 남은 `k`개 문항으로 낸다)
6. **거리**: `d_a = √Σ_i (q'_i − g'_a,i)²`
7. **순위**: `d_a`를 소수 3자리로 반올림해 오름차순, 경쟁 순위(같으면 공동 순위, `/meta.ageGroups` 순으로 나열)
8. **근소**: `(d_2위 − d_1위) ÷ d_2위 < near_tie_ratio` → `nearTie.isNear = true`
9. **패턴 불명확**: TODO(확인 필요). 후보 규칙은 6개 거리의 `(최댓값 − 최솟값) ÷ 최댓값 < flat_pattern_ratio`이면 `weak`
10. **근거**: 1위 연령대(공동이면 `/meta.ageGroups` 순 첫 집단)와 문항별 `|q'_i − g'_a,i|`
    - `closest`: 오름차순 → `questionId` 순 최대 3개
    - `farthest`: `closest`를 뺀 나머지에서 내림차순 → `questionId` 순 최대 3개
11. **또래 비교**: 요청에 `ageGroup`이 있으면 4-3 규칙으로 `peerComparison`을 만든다. 매칭(1~10)과 독립적이며 `status`와 무관하게 계산한다

#### 응답

예시 (`comparable`)

```json
{
  "status": "comparable",
  "reasonCode": null,
  "reason": null,
  "method": "clr_nearest",
  "referenceMonths": ["2025-01", "2025-06"],
  "answeredCount": 14,
  "comparedItems": 12,
  "minimumItems": 6,
  "rankings": [
    {"ageGroup": "50s", "label": "50대", "rank": 1, "distance": 0.824, "isTied": false},
    {"ageGroup": "40s", "label": "40대", "rank": 2, "distance": 0.851, "isTied": false},
    {"ageGroup": "60plus", "label": "60대 이상", "rank": 3, "distance": 1.102, "isTied": false},
    {"ageGroup": "30s", "label": "30대", "rank": 4, "distance": 1.317, "isTied": false},
    {"ageGroup": "20s", "label": "20대", "rank": 5, "distance": 1.905, "isTied": false},
    {"ageGroup": "under20", "label": "20대 미만", "rank": 6, "distance": 2.233, "isTied": false}
  ],
  "matches": [{"id": "50s", "label": "50대"}],
  "nearTie": {"isNear": true, "second": {"id": "40s", "label": "40대"}, "gapRatio": 0.032},
  "patternClarity": "clear",
  "evidenceGroup": {"id": "50s", "label": "50대"},
  "closest": [
    {"questionId": "q14", "minorCode": "land_transport", "name": "기차·고속버스", "metric": "time",
     "userValue": 17.3, "groupValue": 15.1, "unit": "분", "difference": 0.08, "direction": "similar"}
  ],
  "farthest": [
    {"questionId": "q06", "minorCode": "sns", "name": "소셜네트워킹", "metric": "time",
     "userValue": 42.4, "groupValue": 11.6, "unit": "분", "difference": 1.21, "direction": "more"}
  ],
  "excluded": [
    {"questionId": "q13", "minorCode": "online_stock", "name": "온라인 증권거래", "reason": "not_used"},
    {"questionId": "q11", "minorCode": "specialty_mall", "name": "전문쇼핑몰", "reason": "unknown"}
  ],
  "peerComparison": {
    "ageGroup": {"id": "30s", "label": "30대"},
    "comparedItems": 12,
    "more": [
      {"questionId": "q06", "minorCode": "sns", "name": "소셜네트워킹", "metric": "time",
       "relativeRatio": 2.02,
       "message": "30대 이용자 통계에 비해, 다른 앱보다 소셜네트워킹 쪽으로 더 치우쳐 쓴다고 응답하셨어요."}
    ],
    "less": [
      {"questionId": "q14", "minorCode": "land_transport", "name": "기차·고속버스", "metric": "time",
       "relativeRatio": 0.40,
       "message": "30대 이용자 통계에 비해, 기차·고속버스은 다른 앱보다 덜 쓰는 편이라고 응답하셨어요."}
    ],
    "suggestion": {"questionId": "q06", "message": "이번 달에는 SNS 시간을 조금 줄여보는 건 어떨까요?"},
    "matchesStated": false,
    "note": "응답을 LG U+ 2025년 1~6월 30대 이용자 집계와 비교했어요. 측정 방식이 달라 사용량 크기가 아니라 앱 사이의 상대적인 비중으로 비교했어요."
  },
  "resultType": {"name": null, "description": null, "status": "pending"},
  "nextAction": null,
  "isMock": false,
  "source": "LG U+ 제공 연령대·기간(2025년 1~6월) 집계"
}
```

| 필드 | 타입 | null | 의미 |
|---|---|---|---|
| `status` | string | 아니요 | `comparable` / `insufficient` |
| `reasonCode`, `reason` | string | 예 | 비교 불가 이유(아래 표). `comparable`이면 `null` |
| `method` | string | 아니요 | `clr_nearest` (목업은 v1 방식 그대로) |
| `referenceMonths` | string[] | 아니요 | 기준 기간 `[시작월, 끝월]` |
| `answeredCount` | integer | 아니요 | `answered` 응답 수 |
| `comparedItems` | integer | 아니요 | 실제 비교한 문항 수 `k` |
| `minimumItems` | integer | 아니요 | 최소 비교 수 |
| `rankings[]` | object[] | 아니요 | 6개 연령대 전체, 거리 오름차순 |
| `rankings[].ageGroup`, `label` | string | 아니요 | 연령대 |
| `rankings[].rank` | integer | 아니요 | 경쟁 순위 |
| `rankings[].distance` | number | 아니요 | CLR 유클리드 거리, 소수 3자리. **작을수록 비슷함.** 화면에는 숫자 대신 순위 표시를 권장 |
| `rankings[].isTied` | boolean | 아니요 | 같은 순위가 둘 이상이면 `true` |
| `matches[]` | {id, label} | 아니요 | 1위(공동이면 모두) |
| `nearTie` | object | 예 | `{isNear, second: {id, label}, gapRatio}`. `insufficient`이면 `null` |
| `patternClarity` | string | 예 | `clear` / `weak`. `insufficient`이면 `null` |
| `evidenceGroup` | {id, label} | 예 | 근거를 계산한 집단 |
| `closest[]`, `farthest[]` | object[] | 아니요 | 닮은 항목·다른 항목 각각 최대 3개, 서로 겹치지 않음 |
| `…[].questionId`, `minorCode`, `name`, `metric` | string | 아니요 | 문항 |
| `…[].userValue` | number | 아니요 | 내 값. `days`는 일(1~7), `time`은 선택지 대표 분 |
| `…[].groupValue` | number | 아니요 | `evidenceGroup`의 `display` 값 (같은 단위) |
| `…[].unit` | string | 아니요 | `일` / `분` |
| `…[].difference` | number | 아니요 | `|q'_i − g'_a,i|`, 소수 2자리. 작을수록 비슷함 |
| `…[].direction` | string | 아니요 | `more`(내가 상대적으로 더 씀) / `less` / `similar`(`difference` < 0.1) |
| `excluded[]` | {questionId, minorCode, name, reason} | 아니요 | 비교에서 뺀 문항 |
| `peerComparison` | object | 예 | **신규.** 또래 비교(4-3). 요청에 `ageGroup`이 없으면 `null` |
| `resultType` | object | 아니요 | v1과 같음. 지금은 `pending` |
| `nextAction` | {path, label, message} | 예 | 비교 불가일 때 `{"path": "/explore", …}` |
| `isMock`, `source` | boolean, string | 아니요/예 | `/meta`와 같음 |

`reasonCode` (비교 불가)

| 코드 | 뜻 |
|---|---|
| `comparison_disabled` | `similarity.yaml`의 `enabled=false` |
| `too_few_items` | 비교 가능한 문항이 `minimum_items`보다 적음 |

`excluded[].reason`

| 코드 | 뜻 |
|---|---|
| `not_used` | "사용 안 함" (통계가 이용자 기준 평균이라 비교하지 않음) |
| `unknown` | "잘 모르겠음" 또는 응답 없음 |
| `group_missing` | 6개 연령대 중 기준값이 없는 집단이 있음 |

#### 규칙

1. `insufficient`이면 `rankings`, `matches`, `closest`, `farthest`는 `[]`, `nearTie`·`patternClarity`·`evidenceGroup`은 `null`이다. 거리를 0으로 채우지 않는다.
2. 화면 문구: `matches` → "응답 패턴이 ○○ 집단의 통계와 가장 비슷합니다", `nearTie.isNear` → "○○대와도 비슷합니다", `patternClarity=weak` → "응답 패턴이 뚜렷하지 않아요".
3. 결과는 **과거 제공 기간의 이용자 집단 통계와 응답 패턴을 비교한 것**이다. 실제 나이 추정이나 개인 기록 분석처럼 쓰지 않는다.
4. `direction`은 CLR 기준이라 "자기 평소 대비 그 앱에 더 치우쳐 있다"는 뜻이다. "○분 더 쓴다"처럼 절대량으로 말하지 않는다.
5. 또래 비교(`peerComparison`)도 같은 CLR 기준의 상대 비교다(4-3). 절대량 비교는 하지 않는다.

예시 (`insufficient`)

```json
{
  "status": "insufficient",
  "reasonCode": "too_few_items",
  "reason": "비교할 수 있는 문항이 4개라 최소 6개보다 적어요.",
  "method": "clr_nearest",
  "referenceMonths": ["2025-01", "2025-06"],
  "answeredCount": 4,
  "comparedItems": 4,
  "minimumItems": 6,
  "rankings": [], "matches": [], "nearTie": null, "patternClarity": null,
  "evidenceGroup": null, "closest": [], "farthest": [],
  "excluded": [{"questionId": "q04", "minorCode": "game", "name": "게임", "reason": "not_used"}],
  "peerComparison": null,
  "resultType": {"name": null, "description": null, "status": "pending"},
  "nextAction": {"path": "/explore", "label": "세대별 탐색 보기", "message": "연령대별 이용 특성을 둘러볼 수 있어요."},
  "isMock": false,
  "source": "LG U+ 제공 연령대·기간(2025년 1~6월) 집계"
}
```

**v1에서 삭제되는 필드**: `month`(요청·응답), `rankings[].score`, `closest[].userCount`, `normalizedDifference`, `answerFormat`, `zeroCountPolicy`

### 4-3. 또래 비교 `peerComparison` — 신규

사용자가 **직접 고른** 자기 연령대의 이용자 통계와 응답을 **상대적으로** 비교해 "그 연령대 이용자 통계에 비해 다른 앱보다 어느 쪽으로 더·덜 치우쳐 쓰는지"를 보여 주고, 가벼운 제안 문장을 하나 붙인다.

- **연령 추정이 아니다.** 사용자가 고른 연령대를 그대로 쓴다(AGENTS.md 8장 "실제 연령 추정"과 다름).
- **상대 비교(CLR)를 쓴다. 절대량("○배 많이 써요")은 비교하지 않는다.** 이유:
  - LG U+ 집계와 자기보고는 측정 방식이 달라 절대 수준이 맞지 않을 수 있다(예: 집계는 일부 이용만 잡혔을 가능성. 와이파이 포함 여부는 확인할 수 없음). 절대 비교는 이 차이가 그대로 "더 많이 써요"로 나타난다.
  - 응답은 "최근 7일에 쓴 사람"만 1~7일로 답하므로, 통계가 일주일에 1일 근처인 분류(웹툰·게임 일수)는 답하는 순간 "많이"가 되기 쉽다.
  - CLR은 모든 답에 공통으로 걸리는 배수(측정 차이·응답 버릇)를 지우므로 이런 차이에 흔들리지 않는다. 매칭과 같은 기준이라 결과 화면 전체가 일관된다.
- **매칭 순위에는 쓰지 않는다.** 매칭과 같은 CLR 값을 쓰지만, 고른 연령대와의 문항별 차이만 계산한다.
- **저장하지 않는다.** `ageGroup`은 이 요청의 계산에만 쓴다.

#### 계산

1. 대상 문항: 매칭에 쓴 문항과 같음 (`answered`이고 6개 연령대 기준값이 모두 있는 문항, `k`개)
2. 사용자 CLR `q'_i`, 고른 연령대 CLR `g'_i`: 매칭 4-2의 5단계와 같은 값 (답한 문항만으로, 일수·시간 함께 중심화)
3. 문항별 상대 배수 `relativeRatio_i = exp(q'_i − g'_i)` (소수 2자리)
   - 뜻: "자기 평소 수준에 비해 이 문항에 치우친 정도"가, 고른 연령대 이용자 통계보다 몇 배인가
4. 판정: `relativeRatio ≥ more_ratio`(1.5) → `more`, `≤ less_ratio`(0.67) → `less`, 그 사이는 보여 주지 않음
5. `more`·`less` 각각 `|ln relativeRatio|` 내림차순 → `questionId` 순으로 최대 `max_items`(2)개
6. 제안 `suggestion`: `more` 중 `suggest_reduce: true`인 분야에서 `relativeRatio`가 가장 큰 1개. 없으면 `null`
7. `matchesStated`: 매칭 1위(`matches`)에 고른 연령대가 들어 있으면 `true`
8. 비교 문항이 `minimum_items`(6) 미만이면 매칭과 같이 비교하지 않는다 → `peerComparison: null`

#### 설정 (`config/peer_messages.yaml`, 신규)

```yaml
more_ratio: 1.5
less_ratio: 0.67
max_items: 2
templates:
  more: "{age} 이용자 통계에 비해, 다른 앱보다 {name} 쪽으로 더 치우쳐 쓴다고 응답하셨어요."
  less: "{age} 이용자 통계에 비해, {name}은 다른 앱보다 덜 쓰는 편이라고 응답하셨어요."
  stated_differs: "응답 패턴은 {match} 통계와 가장 비슷하지만, 고른 연령대는 {age}예요."
  note: "응답을 LG U+ 2025년 1~6월 {age} 이용자 집계와 비교했어요. 측정 방식이 달라 사용량 크기가 아니라 앱 사이의 상대적인 비중으로 비교했어요."
categories:                      # 분야별 톤. 없는 분야는 중립(제안 없음)
  sns:     {suggest_reduce: true,  reduce: "이번 달에는 SNS 시간을 조금 줄여보는 건 어떨까요?"}
  ott:     {suggest_reduce: true,  reduce: "이번 달에는 동영상 보는 시간을 조금 줄여보는 건 어떨까요?"}
  game:    {suggest_reduce: true,  reduce: "이번 달에는 게임 시간을 조금 줄여보는 건 어떨까요?"}
  webtoon: {suggest_reduce: true,  reduce: "이번 달에는 웹툰 보는 시간을 조금 줄여보는 건 어떨까요?"}
  weather: {suggest_reduce: false}
  online_stock: {suggest_reduce: false}   # 투자 권유·만류로 읽히지 않게 제안하지 않음
```

#### 응답 필드

| 필드 | 타입 | null | 의미 |
|---|---|---|---|
| `ageGroup` | {id, label} | 아니요 | 사용자가 고른 연령대 |
| `comparedItems` | integer | 아니요 | 또래 비교에 쓴 문항 수 |
| `more[]`, `less[]` | object[] | 아니요 | 최대 2개씩. 없으면 `[]` |
| `…[].questionId`, `minorCode`, `name`, `metric` | string | 아니요 | 문항 |
| `…[].relativeRatio` | number | 아니요 | `exp(q'_i − g'_i)`. 상대적 치우침의 배수 (1보다 크면 더, 작으면 덜) |
| `…[].message` | string | 아니요 | 템플릿 문장 |

절대값(`userValue`, `peerValue`, `ratio`)은 내보내지 않는다. 화면이 "○배 많이" 같은 절대 비교로 쓰지 않게 하기 위해서다.
| `suggestion` | {questionId, message} | 예 | 제안 문장 1개. 해당 분야가 없으면 `null` |
| `matchesStated` | boolean | 아니요 | 매칭 1위에 고른 연령대가 있는지. `false`면 `stated_differs` 문장을 화면에 쓸 수 있다. 매칭이 `insufficient`면 `false` |
| `note` | string | 아니요 | 출처·범위 안내 문장 |

#### 규칙

1. **문구**: "사용했어요"가 아니라 "**응답하셨어요**"(실제 이용 기록 분석처럼 보이지 않게), "또래"가 아니라 "**○○대 이용자 통계**"(이용자만의 평균이라서).
2. **제안은 가볍게, 하나만**: "어떨까요?" 형태. "줄여야 합니다", 건강·중독 표현은 쓰지 않는다. 생활·정보·금융 분야는 제안하지 않는다.
3. **AI 생성 문장을 쓰지 않는다.** 템플릿만 쓴다 → 같은 입력이면 같은 문장(AGENTS.md 8장).
4. **배수를 문장에 넣지 않는다**: 상대 배수는 직관적이지 않으므로 "더 치우쳐", "덜 쓰는 편"처럼 방향만 말한다.
5. 금지: "당신은 ○○대입니다", "디지털 나이", "실제 나이와 다르다", "○배 많이 써요", "또래보다 많이 써요"(절대량 표현).
6. **한계 안내**: `note`에 "응답과 집계의 측정 방식이 달라, 사용량 크기가 아니라 앱 사이의 상대적인 비중으로 비교했어요"를 넣는다.

---

## 5. GET `/explore/signals` — 신규 (임기범)

### 5-0. 컨셉

**이 달의 특이 신호**: 그 달, 그 연령대에서 **평소보다 확실히 크게 달라진 분야**만 골라 보여 준다. 대부분의 분야는 달마다 거의 변하지 않으므로, 모든 달을 나열하지 않고 변화가 큰 칸만 인사이트로 보여 준다.

| 신호 유형 | 뜻 | 화면 문구 예 |
|---|---|---|
| `market` (전체 신호) | 여러 연령대가 함께 움직임. 외부 이슈·계절 영향일 수 있음 | "여러 연령대에서 함께 나타난 신호" |
| `generation` (세대 신호) | 공통 변화를 빼고도 그 연령대만 크게 움직임 | "○○대에서만 두드러진 신호" |

### 5-1. 파이프라인 산출물 추가: `monthlySignals`

판정은 **Python 파이프라인**이 한다. Java는 필터·정렬만 한다(AGENTS.md 4장).

**구현 완료(초안 기준값)**: `pipeline/appbti_pipeline/reference.py`의 `build_monthly_signals`. 기준값은 `config/codebook.yaml`의 `monthly_signals`에서 읽고, `status: draft`로 내보낸다. 산식 확정(임기범 · 우서현) 후 `status: confirmed`로 바꾼다. `enabled: false`이거나 설정이 없으면 `monthlySignals`를 내보내지 않는다(→ API는 `unavailable`).

```json
"monthlySignals": {
  "status": "draft",
  "rule": {"minRatio": 1.25, "minZ": 3.0, "generationMinRatio": 1.25, "minStd": 0.02, "edgeMinRatio": 1.5, "edgeMonthPolicy": "stricter_and_flag"},
  "items": [
    {"month": "2025-04", "ageGroup": "50s", "minorCode": "bitcoin", "metric": "days",
     "direction": "up", "ratio": 1.62, "z": 4.1, "type": "market", "isEdgeMonth": false},
    {"month": "2025-04", "ageGroup": "50s", "minorCode": "parenting", "metric": "days",
     "direction": "up", "ratio": 1.38, "z": 3.6, "type": "generation", "isEdgeMonth": false}
  ]
}
```

- `items`는 `month` → `ageGroup` → `z` 내림차순 → 변화 크기 내림차순 → `minorCode` 순으로 정렬해 내보낸다.
- 6개 연령대 중 하나라도 판정할 수 없는(값이 없는) 분류·지표에서는 공통 변화를 계산하지 않으므로 세대 신호로 판정하지 않는다.

판정 기준 (초안, 연령대 `a` · 분야 `c` · 지표 `k` · 월 `m`)

1. 로그값 `L_m` = `days`면 `ln(평균 이용일수 ÷ 그 달 실제 일수)`, `time`이면 `ln(일평균 이용시간)`
2. 변화 `δ = L_m − mean(나머지 5개월의 L)`, 흔들림 `s = std(나머지 5개월의 L)` (하한 0.02)
3. **신호**: `|δ| ≥ ln(minRatio)` 그리고 `|δ| ÷ s ≥ minZ`
4. **유형**: 같은 분야·지표·월의 6개 연령대 평균 변화 `δ̄`를 빼고 `|δ − δ̄| ≥ ln(generationMinRatio)`이면 `generation`, 아니면 `market`
5. `ratio = exp(δ)`, `z = |δ| ÷ s`, 각각 소수 2자리·1자리
6. 그 달이나 나머지 달 중 값이 `null`인 칸은 판정하지 않는다(0으로 채우지 않음)
7. **처음·끝 달**(`2025-01`, `2025-06`)은 한쪽 달들하고만 비교돼 완만한 변화도 잡히므로, 변화 기준을 `edgeMinRatio`(1.5배)로 높이고 `isEdgeMonth=true`로 표시한다. (적용 결과: 신호 66개 → 30개, 처음·끝 달 46개 → 10개)

### 5-2. 요청

| 입력 | 필수 | 의미 |
|---|---|---|
| `month` | 예 | `/meta.months` 중 하나 |
| `ageGroup` | 아니요 | `/meta.ageGroups[].id`. 생략 시 6개 연령대 전체 |
| `type` | 아니요 | `market` / `generation`. 생략 시 전체 |
| `metric` | 아니요 | `days` / `time`. 생략 시 전체 (`metrics.dailyTime=false`면 `time` 신호는 내보내지 않음) |
| `major` | 아니요 | 이 대분류의 분야만 |
| `limit` | 아니요 | 1 이상 정수. 생략 시 전체 |
| `dataset` | 아니요 | 기본 `basic` |

400: 없는 월·연령대·대분류, 잘못된 `type`·`metric`·`limit`

### 5-3. 응답

```json
{
  "status": "available",
  "month": "2025-04",
  "ageGroup": {"id": "50s", "label": "50대"},
  "isEdgeMonth": false,
  "rule": {"minRatio": 1.25, "minZ": 3.0},
  "signals": [
    {"rank": 1, "minorCode": "bitcoin", "name": "비트코인", "major": "금융/재테크", "metric": "days",
     "direction": "up", "ratio": 1.62, "z": 4.1, "type": "market",
     "ageGroup": {"id": "50s", "label": "50대"}},
    {"rank": 2, "minorCode": "parenting", "name": "육아", "major": "가족", "metric": "days",
     "direction": "up", "ratio": 1.38, "z": 3.6, "type": "generation",
     "ageGroup": {"id": "50s", "label": "50대"}}
  ],
  "message": null,
  "isMock": false,
  "source": "LG U+ 제공 연령대·기간(2025년 1~6월) 집계"
}
```

| 필드 | 타입 | null | 의미 |
|---|---|---|---|
| `status` | string | 아니요 | `available` / `unavailable` (산출물에 `monthlySignals`가 없음) |
| `month` | string | 아니요 | 요청한 달 |
| `ageGroup` | {id, label} | 예 | 요청한 연령대. 생략했으면 `null` |
| `isEdgeMonth` | boolean | 아니요 | 처음·끝 달 여부. `true`면 화면에 "기간 처음·끝 달이라 신호가 많을 수 있어요" 안내 |
| `rule` | object | 아니요 | 판정 기준. 화면의 설명 문구에 쓴다 |
| `signals[]` | object[] | 아니요 | 신호 목록. 없으면 `[]` |
| `signals[].rank` | integer | 아니요 | `z` 내림차순 경쟁 순위 |
| `signals[].minorCode`, `name`, `major` | string | 아니요 | 분야 |
| `signals[].metric` | string | 아니요 | `days` / `time` |
| `signals[].direction` | string | 아니요 | `up` / `down` |
| `signals[].ratio` | number | 아니요 | 나머지 달 평균 대비 배수 (예: 1.62 = 약 1.6배) |
| `signals[].z` | number | 아니요 | 평소 흔들림 대비 몇 배 변했나 |
| `signals[].type` | string | 아니요 | `market` / `generation` |
| `signals[].ageGroup` | {id, label} | 아니요 | 신호가 나온 연령대 (`ageGroup` 생략 요청에서 구분용) |
| `message` | string | 예 | 신호가 없으면 "평소와 비슷한 달이에요" |
| `isMock`, `source` | boolean, string | 아니요/예 | `/meta`와 같음 |

### 5-4. 규칙

1. 정렬: `z` 내림차순 → `ratio`의 변화 크기(`|ln ratio|`) 내림차순 → `minorCode` 오름차순. 동점은 `z` 소수 1자리 기준.
2. Java는 산출물 값을 **필터·정렬만** 한다. 다시 계산하지 않는다.
3. 화면 문구
   - 사용: "평소보다 크게 늘었어요(나머지 달 대비 약 1.6배)", "여러 연령대에서 함께 나타난 신호", "○○대에서만 두드러진 신호"
   - 금지: "추세", "급증한 인기", "○○대가 가장 많이 쓰는", 원인 단정("비트코인 시세 때문에")
   - 원인은 "외부 이슈 영향 가능성"처럼 추정으로만 쓴다
4. 6개월 자료라 전년 비교·추세가 아니라 **그 달의 특이점**이다.
5. 이용시간(`time`) 신호는 LG U+ 하루 기준 확인 전까지 "참고"로 표시한다.
6. 이용자 수(UU)로 신호를 만들지 않는다(모수 없음, 카테고리 간 합산 금지).

---

## 6. 테스트 기준 (가상 값만)

Python 분석과 Java 구현이 같은 결과를 내는지 **고정 사례**로 확인한다. 사례의 기준값·응답·기대 거리는 Python에서 가상 값으로 계산해 테스트에 넣는다.

**설문 결과 (`/survey/result`)**

| 사례 | 확인할 것 |
|---|---|
| 정상 14문항 | 순위, 거리(소수 3자리), 근거 3개씩 |
| 미응답 섞임 (`not_used`·`unknown`) | 답한 문항만으로 양쪽 중심화, `excluded` |
| 5문항만 답함 | `insufficient`, `too_few_items`, `nextAction` |
| 모든 답에 같은 배수 (응답 버릇) | 순위가 바뀌지 않음 |
| 1·2위 거리가 거의 같음 | `nearTie.isNear = true` |
| 기준값 `null`인 연령대 | `group_missing` |
| 같은 입력 반복 | 같은 결과 |
| 형식 오류 | 400 (`value` 범위 밖, 중복, 오타) |

**또래 비교 (`peerComparison`)**

| 사례 | 확인할 것 |
|---|---|
| `ageGroup` 없음 | `peerComparison = null`, 매칭 결과는 그대로 |
| `ageGroup` 있음 | 매칭 순위·거리가 `ageGroup` 없을 때와 **똑같음** |
| 1.5배 이상 / ⅔배 이하 / 그 사이 | `more` / `less` / 표시 안 함 |
| `not_used`·`unknown` 문항 | 또래 비교에서도 제외 |
| `more`에 SNS·게임 등 | `suggestion` 1개 |
| `more`에 날씨·증권만 | `suggestion = null` |
| 매칭이 `insufficient` (비교 문항 6개 미만) | `peerComparison = null` (4-3 계산 8) |
| 없는 `ageGroup` | 400 |

**이 달의 특이 신호 (`monthlySignals`, `/explore/signals`)**

| 사례 | 확인할 것 |
|---|---|
| 한 칸만 크게 변한 가상 6개월 | 그 칸만 신호, `ratio`·`z` 값 |
| 6개 연령대가 함께 변함 | `type = market` |
| 한 연령대만 변함 | `type = generation` |
| 25% 미만 변화 / 흔들림 3배 미만 | 신호 아님 |
| 값이 `null`인 달 포함 | 판정하지 않음 (0으로 채우지 않음) |
| 처음·끝 달 | `isEdgeMonth = true` |
| 신호 없는 달 | `signals = []`, `message` |
| 필터 (`ageGroup`, `type`, `metric`, `major`, `limit`) | 결과 범위와 정렬 |
| 산출물에 `monthlySignals` 없음 | `status = unavailable` |

---

## 7. 담당별 체크리스트

**임기범 · 우서현 (데이터 처리: 파이프라인·산식)**
- [ ] 시간 지표 켜기: 원본에 시간 단위 열이 비어 있으므로 LG U+ 답변대로 "분"으로 보고 `avgDailyTime`을 산출 (지금 산출물은 3,744행 모두 `null`)
- [ ] `surveyReference` 산출: 월별 `ln(평균 이용일수 ÷ 그 달 일수)`, `ln(일평균 이용시간)`의 6개월 평균, `display`(기하평균)
- [ ] 한 달이라도 결측·0이면 `null`
- [ ] 테스트: 가상 2개월 데이터로 `logMean`, `display`, 결측 처리
- [ ] 특이 신호 산식 확정·문서화: `minRatio`, `minZ`, 세대 신호 기준, 처음·끝 달 처리, 최소 이용자 수 기준 여부
- [ ] `monthlySignals` 산출 (5-1 기준, 산식 확정 후)
- [ ] 기존 파이프라인 담당(차현우)에게 변경 범위 공유 (AGENTS.md 3장: 다른 사람 담당 파일을 고칠 때 먼저 알림)

**신진용 (설문·결과 API)** — 임기범이 초안 구현함, 담당 검토 필요
- [x] `survey_questions.yaml` 14문항, `similarity.yaml` v2 설정 (문구·기준값은 초안)
- [x] `SurveyRequest`: `status`, `value` 범위 검사 (`ClrMatcher.validate`)
- [x] `ClrMatcher`: `clr_nearest` (6장 설문 결과 사례 모두, `ClrMatcherTests`)
- [x] `peerComparison`: `ageGroup` 선택 입력, `peer_messages.yaml` 적재, 템플릿 문장
- [x] 목업은 기존 방식 유지 (`similarity.mock.yaml`의 `method`로 분기)

**임기범 (조회·탐색 API)**
- [x] `/meta.survey` 값 갱신 (`questionCount`, `period`, `method`, `timeAvailable`)
- [x] `ProfileRepository`가 `surveyReference`를 적재하고, 없으면 설문 비교를 `comparison_disabled`로 처리
- [x] `ProfileRepository`가 `monthlySignals`를 적재
- [x] `GET /explore/signals`: 필터·정렬만, 400 검사, `unavailable`, 테스트(`ExploreSignalsTests`)
- [x] 오류 본문 `{status, code, message}` (`ApiErrors`, `ApiException`)

**심유진 (화면)**
- [ ] 설문: `metric`별 입력 (일수 1~7 버튼, 시간 5지선다), "사용 안 함"·"잘 모르겠음"
- [ ] 결과: 1위 + 근소 시 2위, 불명확 안내, 닮은·다른 항목(단위 표시), 비교 불가 시 탐색 안내
- [ ] 거리 숫자는 화면에 크게 보이지 않기 (순위 중심)
- [ ] 결과: 「내 연령대 선택(선택 사항)」 → 또래 비교 카드(📈 많이 / 📉 적게), 제안 1개, `note` 출처 문구, `matchesStated=false`면 "응답 패턴은 ○○대와 가장 비슷하지만 고른 연령대는 ○○대예요"
- [ ] 탐색 「이 달의 특이 신호」 탭: 달·연령대 선택, 신호 카드(↑/↓, 배수, 유형), 신호 없을 때 메시지, 처음·끝 달 안내

---

## 8. TODO(확인 필요)

- **일평균 이용시간의 하루 기준**(이용한 날 / 달력 일수): 지표 정의는 LG U+ 답변(일평균 이용시간, 분)으로 고정했으므로 시간 문항은 켠다(`timeAvailable: true`). 하루 기준은 시간 문항 문구("사용한 날, 하루에" / "하루 평균")에만 영향을 주므로 LG U+ 답을 받으면 문구만 맞춘다.
- **코드북 정의 정리**: `config/codebook.yaml`의 `real_analysis.metric_definitions`(접속 횟수 가정)는 v2와 다르다. 구현할 때 파이프라인이 이 블록을 읽지 않도록 하거나 v2 정의로 바꾼다(데이터 처리 담당: 임기범 · 우서현, 기존 파이프라인 담당 차현우에게 공유).
- **카테고리 정의**: 전문쇼핑몰, 모바일 은행, 증권, 기차·고속버스, 포털에 포함되는 앱. 질문 예시 앱 이름을 정하려면 필요하다.
- **패턴 불명확 기준** `flat_pattern_ratio` 값.
- **`direction`의 `similar` 기준값**(초안 0.1).
- **화면에 거리 숫자를 보여 줄지**: 권장은 순위·근소 표시만.
- **최소 비교 수 6**: 모의 응답 테스트 기준이며, 파일럿 설문으로 다시 볼 수 있다.
- **특이 신호 기준값**: `minRatio`(1.25), `minZ`(3.0)는 로컬 시험값이다. 처음·끝 달에 신호가 몰리는 문제와 이용자가 적은 분야의 처리(최소 UU 기준)를 정해야 한다.
- **특이 신호 원인 표시**: 원인은 데이터에 없다. 화면에 원인을 적을지(추정 표시) 정한다.
- **또래 비교 기준값**: `more_ratio`(1.5), `less_ratio`(0.67), "약 ○배" 반올림 규칙, 분야별 톤(어느 분야에 줄이기 제안을 할지). 문구는 우서현과 확정한다.
- **또래 비교와 개인정보**: 연령대 선택은 선택 사항이며 저장하지 않는다. 화면에 이 점을 안내할지 정한다.
