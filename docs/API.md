# 프로토타입 API 계약

모든 경로는 `/api` 기준이다. `dataset=basic`이 기본이고 `dataset=time`은 시간 지표가 있는 가상 데이터다.
실제 산출물을 적재하면 가상 시간 데이터 선택을 제공하지 않는다. 서버에서 설문 응답을 저장하지 않는다.

| 메서드·경로 | 입력 | 응답 |
|---|---|---|
| GET `/meta` | dataset | 기간, 집단·분류 목록, 지표 가용 여부, comparisonEnabled, zeroDaysPolicy, isMock, source, availableDatasets |
| GET `/profiles` | month 생략 시 최신월 | month, profiles (Python 산출물 행) |
| GET `/profiles/trend` | minor 필수 | minorCode, profiles, continuityBreaks |
| GET `/survey/questions` | dataset | month, questions, maxDays, timeAvailable, minimumCategories, zeroDaysPolicy |
| POST `/survey/result` | 아래 본문 | status, reason, matches, scores, closest, farthest, excluded, comparedCategories, source |

```json
{"month":"2025-06","answers":[{"minorCode":"learn","days":15,"minutes":null}]}
```

days=null은 무응답, days=0은 사용 안 함이다. 음수, 해당 월 일수 초과, 1440분 초과, 중복·미등록 문항은 HTTP 400이다.
설문 입력 형식이 맞지만 공통 비교 항목이 부족하면 HTTP 200, status=insufficient, 빈 scores와 이유를 반환한다.
정상 비교는 status=comparable이다. 동일 입력은 동일 결과이고 동점은 집단 ID 순으로 공동 표시한다.
집단 수치의 결측은 null이며 0으로 대체하지 않는다. 미제공 데이터 버전은 404, 산출물이 없으면 503이다.
오류 응답은 message 문자열을 포함한다. 잘못된 JSON 본문은 Spring 기본 HTTP 400이다.

## POST `/survey/result` — 확장 응답 초안 (11/11 회의 확정 전)

이 절은 신진용이 11/10 팀원 전원과 심유진에게 공유하는 **문서 초안**이다. 현재 서버는 아래의 기존 필드만 반환하며, 추가 필드는 구현하지 않았다. 기존 필드의 이름·타입·의미는 유지한다. 요청 형식과 HTTP 상태 규칙도 위 계약을 따른다.

- [비교 가능 예시](examples/survey_result.json): `status=comparable`, 6개 연령대, 공동 1위, 닮은 항목 3개·다른 항목 3개.
- [비교 부족 예시](examples/survey_result_insufficient.json): `status=insufficient`, 비교 항목 2개·최소 4개, 빈 순위와 탐색 안내.

두 JSON의 모든 측정값·점수는 직접 만든 **예시(가상) 값**이다. 원본·정제 데이터에서 가져오지 않았다. `example_age_*`, `example_minor_*`와 중분류 이름은 설명용 가상 식별자·이름이며 실제 코드북이나 확정 설문을 뜻하지 않는다. 연령대 라벨만 제공 6구간을 사용했다. 현재 목업 A~F 식별자를 실제 연령대에 매핑한 예시도 아니다. 실제 응답에서는 연령대·중분류 식별자와 라벨을 `/meta` 및 코드북에 맞춘다. `_comment`는 예시 파일의 설명용 필드이며 API 필드로 추가하지 않는다.

비교 가능 예시는 일수만 비교하고 항목 가중치를 모두 1로 가정했다. 근거의 6개 항목을 코드 순으로 놓으면 내 응답은 모두 10일, 첫 집단 값은 10~15일이다. 나머지 집단 값은 첫 집단 값에 순서대로 0·1·2·3·10일을 더한 가상 값이며, 항목별 집단 범위는 10일이다. 따라서 정규화 차이는 0~0.5, 최상위 점수는 75.0으로 일관된다. 마지막 집단의 0.0점은 계산 결과이며 결측 대체값이 아니다. 두 예시는 가상 8개 문항 중 0일 응답 1개를 제외하므로 응답 수가 비교 수보다 1개 많다.

### 현재 구현 필드 (그대로 유지)

`SimilarityCalculator.Result`, `Evidence`, `Score`, `Excluded`와 `ProfileData.AgeGroup`을 기준으로 정리했다. “기존”은 현재 구현에 있다는 뜻이며 실제 데이터용 비교 설정이 확정됐다는 뜻은 아니다. 모든 배열은 `null` 대신 빈 배열을 허용한다.

| 이름 | JSON 타입 | null 가능 | 의미 | 확정 여부 |
|---|---|---|---|---|
| `status` | string | 아니요 | `comparable` 또는 `insufficient` | 기존 |
| `reason` | string | 예 | 비교 가능 시 `null`, 비교 불가 시 이유. 설정 비활성도 `insufficient` | 기존 |
| `month` | string | 아니요 | 비교 기준월 `YYYY-MM`. 요청 생략 시 적재 데이터 최신월 | 기존 |
| `comparedCategories` | integer | 아니요 | 실제 비교에 포함된 공통 중분류 수. 설정 비활성 시 0 | 기존 |
| `minimumCategories` | integer | 아니요 | 설정 최소 비교 수. 설정이 `null`이면 메타 중분류 전체 개수 | 기존 |
| `answeredCount` | integer | 아니요 | `days != null` 응답 수. 0일·비교 제외 항목도 포함하며 비교 수와 다름 | 기존 |
| `matches` | object[] | 아니요 | 최상위 공동 집단들. `insufficient`이면 `[]` | 기존 |
| `matches[].id`, `matches[].label` | string | 아니요 | 메타의 연령집단 ID와 표시 라벨 | 기존 |
| `scores` | object[] | 아니요 | 비교 집단 전체의 점수 목록. 현재 메타 집단 수에 따름. `insufficient`이면 `[]` | 기존 |
| `scores[].ageGroup`, `scores[].label` | string | 아니요 | 집단 ID, 표시 라벨 | 기존 |
| `scores[].score` | number | 아니요 | 패턴 유사도 0~100, 소수 1자리 반올림 | 기존 |
| `closest`, `farthest` | object[] | 아니요 | 현재 최상위 집단 하나에 대한 닮은 항목·다른 항목, 각각 최대 3개 | 기존 |
| `closest[].minorCode`, `farthest[].minorCode` | string | 아니요 | 중분류 코드 | 기존 |
| `closest[].name`, `farthest[].name` | string | 아니요 | 중분류 이름 | 기존 |
| `closest[].major`, `farthest[].major` | string | 아니요 | 대분류 이름 | 기존 |
| `closest[].userDays`, `farthest[].userDays` | number | 아니요 | 내 설문 응답 일수. 개인의 실제 기록을 뜻하지 않음 | 기존 |
| `closest[].groupDays`, `farthest[].groupDays` | number | 아니요 | 같은 기준월·중분류의 비교 집단 평균 이용일수 | 기존 |
| `closest[].userMinutes`, `farthest[].userMinutes` | number | 예 | 시간 비교에 사용한 응답 분. 시간 차원을 사용하지 않으면 `null` | 기존 |
| `closest[].groupMinutes`, `farthest[].groupMinutes` | number | 예 | 시간 비교에 사용한 집단 값(분). 시간 차원을 사용하지 않으면 `null` | 기존 |
| `closest[].differenceDays`, `farthest[].differenceDays` | number | 아니요 | 응답 일수와 집단 평균 이용일수 차이의 절댓값 | 기존 |
| `closest[].normalizedDistance`, `farthest[].normalizedDistance` | number | 아니요 | 0~1 정규화 차이. 작을수록 비슷함. 시간 비교 시 유효 일수·시간 차원 차이의 평균 | 기존 |
| `excluded` | object[] | 아니요 | 비교 제외 항목. 설정 비활성 시 검사 전 반환하므로 `[]` | 기존 |
| `excluded[].minorCode`, `excluded[].name`, `excluded[].reason` | string | 아니요 | 제외 중분류 코드·이름·사유 | 기존 |
| `isMock` | boolean | 아니요 | 적재 메타의 가상 데이터 여부. 예시는 `true`, 화면에 “예시 데이터” 표시 | 기존 |
| `source` | string | 예 | 적재 메타의 출처 문자열을 그대로 반환. 현재 Java 타입은 비어 있음을 막지 않음 | 기존 |

현재 `scores`는 **반올림 전 거리 오름차순 → 집단 ID 순**이며, `matches`는 최저 거리와의 차이가 `1e-9` 미만인 집단이다. 근거는 그중 첫 집단(최저 거리, 같으면 ID 순)을 사용한다. 표시 점수가 같더라도 `matches`가 아닐 수 있다. 이 동작을 새 필드 때문에 바꾸지 않는다.

### 추가 필드 제안

아래 필드는 모두 **초안·미구현**이다. `rankings`, `majorScores` 등은 새 필드이며 기존 `scores`, `closest`, `farthest`를 삭제하거나 이름을 바꾸지 않는다.

| 이름 | JSON 타입 | null 가능 | 의미 | 확정 여부 |
|---|---|---|---|---|
| `rankings` | object[] | 아니요 | 비교 가능 시 제공 6개 연령대 전체 순위. 비교 불가 시 `[]` | 초안 |
| `rankings[].ageGroup`, `rankings[].label` | string | 아니요 | `scores`와 같은 연령대 ID·라벨 | 초안 |
| `rankings[].score` | number | 아니요 | `scores`에서 받은 0~100 패턴 유사도, 소수 1자리 | 초안 |
| `rankings[].rank` | integer | 아니요 | 1부터 시작하는 공동 순위 | 초안 |
| `rankings[].isTied` | boolean | 아니요 | 같은 순위에 집단이 둘 이상이면 `true` | 초안 |
| `evidenceGroup` | object | 예 | 기존 `closest`·`farthest`가 비교한 단일 집단. 비교 불가 시 `null` | 초안 |
| `evidenceGroup.id`, `evidenceGroup.label` | string | 아니요 | 기존 계산기가 근거를 선택한 집단 ID·라벨 | 초안 |
| `majorScores` | object[] | 아니요 | 레이더용 대분류 배열. 설문 대상 대분류만 포함, 비교 불가 시 `[]` | 초안 |
| `majorScores[].major` | string | 아니요 | 코드북의 대분류 이름 | 초안 |
| `majorScores[].userScore`, `majorScores[].groupScore` | number | 예 | 응답 측·`evidenceGroup` 측 대분류 점수. 산식 미확정 동안 모두 `null` | 초안·우서현 산식 대기 |
| `majorScores[].formulaStatus` | string | 아니요 | 현재 초안은 `pending`만 사용(산식 미확정). 확정 후 상태값 별도 합의 | 초안 |
| `resultType` | object | 아니요 | 통계 비교 결과에 붙일 문구 자리 | 초안 |
| `resultType.name`, `resultType.description` | string | 예 | 유형 이름·한 줄 설명. 우서현 제공 전과 비교 불가 시 `null` | 초안·우서현 문구 대기 |
| `resultType.definitionStatus` | string | 아니요 | 현재 초안은 `pending`만 사용(유형 정의 미확정) | 초안 |
| `nextAction` | object | 예 | 비교 불가 시 세대별 탐색 화면 안내. 비교 가능 시 `null` | 초안 |
| `nextAction.type` | string | 아니요 | `explore` (화면 목적 식별자) | 초안 |
| `nextAction.path` | string | 아니요 | 현재 프론트 경로 `/explore`. API 호출 경로가 아님 | 초안 |
| `nextAction.label` | string | 아니요 | “세대별 탐색 보기” 버튼 문구 | 초안 |
| `nextAction.message` | string | 아니요 | 비교 불가 상태에서 집단 통계를 탐색하도록 안내 | 초안 |
| `sourceScope` | object | 아니요 | 출처·범위를 구조화. `source` 문자열은 유지 | 초안 |
| `sourceScope.provider` | string | 예 | 실제 제공자. 가상 예시는 `null`로 두어 LG U+ 실측값으로 오인하지 않게 함 | 초안 |
| `sourceScope.periodStart`, `sourceScope.periodEnd` | string | 예 | 적재 데이터 제공 범위의 시작·종료월 `YYYY-MM`, 미상 시 `null` | 초안 |
| `sourceScope.region` | string | 예 | 집계 지역, 미상 시 `null` | 초안 |
| `sourceScope.ageGroupLabels` | string[] | 아니요 | 데이터가 제공하는 연령 구간, 미상 시 `[]` | 초안 |
| `sourceScope.label` | string | 아니요 | 통계 옆에 보일 출처·범위 문구. 예시에서는 가상임을 명시 | 초안 |

### 정렬·근거·결측·화면 사용 규칙

1. 새 `rankings` 초안은 소수 1자리 **표시 점수 내림차순 → 연령대 ID 문자열 오름차순**으로 정렬한다. 같은 표시 점수는 공동 순위로 하고 경쟁 순위 방식(`1, 1, 3, 4, 5, 6`)을 제안한다. 공동 최상위 집단 모두를 UI에서 표시하며 ID 순서는 대표 연령 판정이 아니다. 기존 `scores`의 반올림 전 정렬·`matches`의 동점 허용오차와 차이가 있으므로 화면에서 어느 필드를 기준으로 쓸지는 회의에서 정한다.
2. 기존 `closest`·`farthest`에 필요한 코드·이름·대분류·내 응답·집단 값·정규화 차이가 이미 있다. 같은 의미의 새 근거 배열은 추가하지 않는다. `evidenceGroup`으로 비교 집단을 명시하며 공동 1위에서도 기존 계산기가 선택한 집단 하나의 근거임을 표시한다. 근거 UI는 `matches` 전체의 평균이나 공통 특징으로 해석하지 않는다.
3. `closest`는 정규화 차이 오름차순 → 중분류 코드 순으로 최대 3개, `farthest`는 `closest`를 제외한 뒤 정규화 차이 내림차순 → 코드 순으로 최대 3개다. 서로 중복하지 않는다. 공통 항목 수를 n이라 하면 개수는 각각 `min(3, n)`, `min(3, max(0, n - 3))`이다. 공통 항목 수가 4개면 3개+1개, 5개면 3개+2개, 6개 이상이면 3개+3개다. 최소 비교 수는 실제 설정을 따르며 부족하면 두 배열 모두 비운다.
4. `majorScores`의 점수 범위·산식·결측 처리 기준은 우서현이 문서화한 뒤 정한다. 확정 전에는 양쪽 점수가 `null`, `formulaStatus=pending`이며 레이더 축에 0점으로 그리지 않는다. 서로 다른 중분류의 UU 합산, 평균 이용일수의 단순 평균·합산은 산식 후보로도 사용하지 않는다. 집단 지표는 Python 산출물을 사용하며 Spring·React에서 재계산하지 않는다.
5. `resultType`은 집단 통계와의 비교를 설명할 자리다. 성격 유형이나 MBTI식 해석을 만들지 않는다. 문구 확정 전에는 `null`을 유지하고 UI에서 임의 유형 이름을 생성하지 않는다.
6. `insufficient`이면 기존 `matches`, `scores`, `closest`, `farthest`와 새 `rankings`, `majorScores`는 `[]`, `evidenceGroup`은 `null`이다. `reason`, `comparedCategories`, `minimumCategories`, `answeredCount`, `excluded`로 원인을 설명하고 `nextAction`으로 탐색을 안내한다. 비교 설정 비활성일 때도 같은 상태지만 `reason`은 설정 미확정 사유이며 비교 수는 0이다. 부족한 항목이나 순위 점수를 0으로 채우지 않는다.
7. 실제 데이터 연결 시 출처 문구 예시는 “LG U+ 제공 연령대·기간(2025년 1~6월) 집계”다. `month`는 결과 비교월이고 `sourceScope`의 기간은 전체 제공 범위이므로 결과가 6개월 평균이라는 뜻이 아니다. 가상 예시는 `source`·`sourceScope.label`에 가상임을 명시하고 `isMock=true`를 유지한다. 실제 연결 시 `isMock`·출처·기간은 적재 메타에서 가져온다.

### TODO(확인 필요) — 11/11 회의 및 후속 전달

- TODO(확인 필요): `rankings`와 기존 `scores` 중 프론트가 사용할 기준 필드, 중복 정보의 동기화 방법. 기존 필드는 유지하며 현재 서버에 새 필드가 있다고 가정하지 않는다.
- TODO(확인 필요): 반올림 후 점수 동점과 기존 반올림 전 거리·`1e-9` 동점 기준의 차이, 경쟁 순위(`1,1,3`) 채택 여부. `matches`와 `rankings`의 공동 최상위 표시가 달라질 때의 화면 정책. 기존 필드 의미를 바꾸는 안은 이번 초안에 포함하지 않는다.
- TODO(확인 필요): 공동 최상위 시 `evidenceGroup` 하나만 보여줄지, 후속 확장으로 집단별 근거를 제공할지. 기존 `closest`·`farthest`는 현재 대표 집단 기준 그대로 유지한다.
- TODO(확인 필요): 실제 12~20개 설문 중분류·코드·가중치·정규화·최소 비교 수·0일 정책. 예시 최소 4개는 시연값이며 실제 확정값이 아니다. 평균 이용일수 분모 및 시간 정의·단위 확인 전에는 시간 비교를 켜지 않는다.
- TODO(확인 필요): 우서현의 대분류 산식, 사용자 측/집단 측 점수 의미·척도·적용 대분류·결측 처리·산식 상태값(11/12 전달). 확정 전 `null`·`pending` 유지.
- TODO(확인 필요): 우서현의 유형 이름·한 줄 설명·부여 기준·정의 상태값(11/12 전달). 확정 전 `null`·`pending` 유지.
- TODO(확인 필요): `nextAction` 필드명·프론트 경로 소유 주체와 심유진의 비교 불가 안내 문구. `reason`·비교 항목 수는 기존 필드 사용.
- TODO(확인 필요): 기존 `source`와 추가 `sourceScope.label` 중 출처 표시 기준, provider·기간·지역 메타 확장과 null 처리. `isMock`은 기존 필드를 기준으로 한다.

## 조회·세대별 탐색 API — 실제 데이터 초안 (11/11 회의 확정 전)

이 절은 임기범이 11/10 팀원 전원과 심유진에게 공유하는 **문서 초안**이다. `/meta`, `/profiles`, `/profiles/trend`는 응답 형태를 바꾸지 않는다. `/explore/ranking`은 **미구현**이다.

- [메타 예시](examples/meta.json): 실제 산출물을 적재했을 때의 구조. 제공 6구간·14개 대분류, `isMock=false`, `availableDatasets=["basic"]`.
- [탐색 랭킹 예시](examples/explore_ranking.json): `status=available`, 공동 순위, 결측 제외.
- [탐색 랭킹 제공 불가 예시](examples/explore_ranking_unavailable.json): 기준일수를 만들 수 없을 때.

세 JSON의 모든 측정값은 직접 만든 **예시(가상) 값**이다. `example_*` 중분류 식별자와 이름은 가상이며, 실제 중분류 코드는 차현우의 코드북을 따른다. 연령대 ID(`under20`, `20s`, `30s`, `40s`, `50s`, `60plus`)·라벨과 대분류 이름은 정제 데이터 구조를 따랐다.

### 기존 조회 API — 실제 데이터에서 달라지는 점

| 경로 | 실제 데이터에서 |
|---|---|
| GET `/meta` | `ageGroups` 6개(제공 6구간), `majorCategories` 14개, `minorCategories` 104개(안전민감 제외 시). `isMock=false`, `availableDatasets=["basic"]`(가상 시간 데이터를 섞지 않음) |
| GET `/profiles?month=` | 한 달 응답 = 6개 연령대 × 중분류 수. 없는 조합도 `status=missing`, 값 `null`인 행으로 내려간다 |
| GET `/profiles/trend?minor=` | 6개월 × 6개 연령대. 빠진 달은 `null`이며 선으로 잇지 않는다. `segment`가 다르면 잇지 않는다 |

- `metrics.weightedReference`는 "평균 이용일수 분모 = 이용자(UU)"가 확인돼 코드북 플래그가 켜진 뒤에만 `true`다. **`false`이면 Python 산출물의 `referenceDays`·`relativeFrequency`가 모두 `null`이다.**
- `metrics.dailyTime`은 이용시간 단위·정의가 코드북에 확정된 뒤에만 `true`다. `false`이면 `avgDailyTime`은 모두 `null`이고 화면은 시간 지표를 끈다.

### (신규) GET `/explore/ranking` — 연령대별 중분류 랭킹

| 입력 | 필수 | 의미 |
|---|---|---|
| `ageGroup` | 예 | `/meta`의 연령대 ID |
| `month` | 아니요 | 생략 시 최신월 |
| `major` | 아니요 | 이 대분류의 중분류만 |
| `limit` | 아니요 | 상위 N개. 생략 시 전체 |
| `dataset` | 아니요 | 기본 `basic` |

| 이름 | JSON 타입 | null 가능 | 의미 |
|---|---|---|---|
| `status` | string | 아니요 | `available` 또는 `unavailable` |
| `reason` | string | 예 | `unavailable`일 때 이유 |
| `month` | string | 아니요 | 기준월 `YYYY-MM` |
| `ageGroup.id`, `ageGroup.label` | string | 아니요 | 연령대 ID·라벨 |
| `major` | string | 예 | 요청한 대분류. 없으면 `null` |
| `basis` | string | 아니요 | 정렬 기준. 현재 `relativeFrequency`만 |
| `isMock`, `source` | boolean, string | 아니요 | 적재 메타 그대로 |
| `items[].rank` | integer | 아니요 | 1부터 시작하는 경쟁 순위(`1, 2, 2, 4`) |
| `items[].minorCode`, `name`, `major` | string | 아니요 | 중분류 코드·이름·대분류 |
| `items[].avgDays` | number | 아니요 | 해당 연령대 평균 이용일수 |
| `items[].referenceDays` | number | 아니요 | 기준일수(UU 가중 평균, Python 산출물) |
| `items[].relativeFrequency` | number | 아니요 | 상대 빈도 = `avgDays ÷ referenceDays` (Python 산출물) |
| `items[].ageShare` | number | 예 | 이 중분류 이용자 중 해당 연령대 비중 |
| `excluded[]` | object[] | 아니요 | `relativeFrequency`가 `null`이라 순위에서 뺀 중분류와 사유(`status` 값) |

규칙
1. **"기준일수 대비 차이"는 `relativeFrequency`(배수)로 표현한다.** 예: "20대의 평균 이용일수는 기준일수의 1.5배". Java에서 새 차이 값을 계산하지 않는다.
2. 정렬은 `relativeFrequency` 내림차순 → `minorCode` 오름차순으로 고정한다. 값이 같으면 같은 순위다. 같은 입력이면 항상 같은 결과다.
3. `relativeFrequency`가 `null`인 중분류는 0으로 두지 않고 `excluded`에 넣는다.
4. `metrics.weightedReference=false`이면 HTTP 200, `status=unavailable`, 빈 `items`를 반환한다.
5. 없는 `ageGroup`·`month`·`major`, 잘못된 `limit`은 400, 미제공 데이터 버전은 404, 산출물이 없으면 503이다.
6. 화면 문구: "○○대가 가장 많이 쓰는", "이용률", "인기"는 쓰지 않는다. → "○○대에서 기준보다 자주 이용하는 분류"
7. 두 연령대 비교는 새 API 없이 `/profiles?month=` 응답에서 두 연령대 행을 골라 쓴다.

### 실제 산출물 연결 시 백엔드 변경 메모

- `ProfileData`는 Python `build_profiles` 출력과 필드가 1:1이라 바꾸지 않는다. Java 코드에는 목업 A~F가 하드코딩돼 있지 않다(테스트 fixture에만 있음).
- `appbti.profiles-path` 기본값은 `../data/processed/profiles.json`이다. 실제 산출물은 `../data/processed/real/profiles.json`이므로 `APPBTI_PROFILES_PATH`로 넘기거나 기본값을 바꾼다. 지금은 실제 파일이 없으면 **경고 없이 목업으로 떨어지므로**, 기동 로그에 어떤 파일을 적재했는지 남긴다.
- `ApiControllerTests` fixture를 실제 구조(제공 6구간 라벨, 대분류 여러 개, 일부 `null`, `weightedReference` true/false)로 갱신한다. 테스트에는 가상 값만 쓴다.

### TODO(확인 필요) — 11/11 회의

- TODO(확인 필요): 랭킹 정렬을 Java에서 할지(정렬·필터만, 지표 재계산 없음), Python 산출물에 순위 필드를 추가할지. 추천: Java 정렬. 순위는 요청(대분류 필터·limit)마다 바뀌므로 산출물에 고정하기 어렵다.
- TODO(확인 필요): LG U+ 분모 답변 전 탐색 화면 처리. 선택지 ① `unavailable` 안내(추천) ② `avgDays` 순위만 표시(연령대 간 비교 아님을 명시). 중간발표(11/18) 전에 답이 없으면 ①이면 탐색 랭킹이 비게 된다.
- 다른 담당 확인 필요: 원본에 status 컬럼이 없는데 현재 `adapter.py`는 status를 필수 컬럼으로 요구한다(차현우). `/survey/questions`가 `minorCategories` 전체를 문항으로 내보내므로 실제 데이터에서는 확정 문항 목록을 따로 읽어야 한다(신진용).

## 시연용 비교 정의

`config/similarity.mock.yaml`만 시연용으로 활성화한다. 실제 데이터의 `config/similarity.yaml`은 미확정 상태로 비활성화한다.
전체 집단과 응답에 공통인 중분류를 고른 뒤, 항목별 집단 최대·최소 차이로 절대 차이를 나눈다.
정규화 차이는 1을 상한으로 두고, 범위가 0인 차원은 제외한다. 시간은 정의가 일치할 때만 추가하며,
같은 중분류의 일수·시간 차이를 평균한 뒤 설정 가중치로 합친다.
패턴 유사도는 `100 × (1 - 가중 평균 거리)`이고 소수점 한 자리로 표시한다. 확률·정확도·실제 연령 추정이 아니다.
0일은 시연 설정상 이용자 기준 평균과 직접 비교하지 않는다. 최소 4개 중분류가 필요하다.
zeroDaysPolicy는 exclude(제외), include(비교 포함), null(미확정)이며 화면 설명은 서버 설정을 따른다.
가중치가 빈 YAML 값이면 기본 가중치 설정인 빈 Map으로 정규화한다. 활성 설정의 미지원 방식·정책·잘못된 가중치는
서버 기동 시 설정 파일 경로와 함께 실패시켜 사용자 입력 오류(400)와 구분한다.
가까운 3개와 먼 3개는 중복 없이 선택한다. 공통 항목이 6개 미만이면 먼 항목 개수는 줄어든다.
기준 변경 전후 시계열은 profiles의 segment로 분리하며, 빠진 달과 null은 선으로 잇지 않는다.

TODO(확인 필요): 실제 분모·단위·설문 시간 정의, 비교 방식·가중치·최소 문항·0일 정책을 데이터 수령 후 합의한다.
