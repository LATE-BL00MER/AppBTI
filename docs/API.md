# 프로토타입 API 계약

모든 경로는 `/api` 기준이다. `dataset=basic`이 기본이고 `dataset=time`은 시간 지표가 있는 가상 데이터다.
실제 산출물을 적재하면 가상 시간 데이터 선택을 제공하지 않는다. 서버에서 설문 응답을 저장하지 않는다.

| 메서드·경로 | 입력 | 응답 |
|---|---|---|
| GET `/meta` | dataset | 기간, 집단·분류 목록, 지표 가용 여부, comparisonEnabled, isMock, source, availableDatasets |
| GET `/profiles` | month 생략 시 최신월 | month, profiles (Python 산출물 행) |
| GET `/profiles/trend` | minor 필수 | minorCode, profiles, continuityBreaks |
| GET `/survey/questions` | dataset | month, questions, maxDays, timeAvailable, minimumCategories |
| POST `/survey/result` | 아래 본문 | status, reason, matches, scores, closest, farthest, excluded, comparedCategories, source |

```json
{"month":"2025-06","answers":[{"minorCode":"learn","days":15,"minutes":null}]}
```

days=null은 무응답, days=0은 사용 안 함이다. 음수, 해당 월 일수 초과, 1440분 초과, 중복·미등록 문항은 HTTP 400이다.
설문 입력 형식이 맞지만 공통 비교 항목이 부족하면 HTTP 200, status=insufficient, 빈 scores와 이유를 반환한다.
정상 비교는 status=comparable이다. 동일 입력은 동일 결과이고 동점은 집단 ID 순으로 공동 표시한다.
집단 수치의 결측은 null이며 0으로 대체하지 않는다. 미제공 데이터 버전은 404, 산출물이 없으면 503이다.
오류 응답은 message 문자열을 포함한다. 잘못된 JSON 본문은 Spring 기본 HTTP 400이다.

## 시연용 비교 정의

`config/similarity.mock.yaml`만 시연용으로 활성화한다. 실제 데이터의 `config/similarity.yaml`은 미확정 상태로 비활성화한다.
전체 집단과 응답에 공통인 중분류를 고른 뒤, 항목별 집단 최대·최소 차이로 절대 차이를 나눈다.
정규화 차이는 1을 상한으로 두고, 범위가 0인 차원은 제외한다. 시간은 정의가 일치할 때만 추가하며,
같은 중분류의 일수·시간 차이를 평균한 뒤 설정 가중치로 합친다.
패턴 유사도는 `100 × (1 - 가중 평균 거리)`이고 소수점 한 자리로 표시한다. 확률·정확도·실제 연령 추정이 아니다.
0일은 시연 설정상 이용자 기준 평균과 직접 비교하지 않는다. 최소 4개 중분류가 필요하다.
가까운 3개와 먼 3개는 중복 없이 선택한다. 공통 항목이 6개 미만이면 먼 항목 개수는 줄어든다.
기준 변경 전후 시계열은 profiles의 segment로 분리하며, 빠진 달과 null은 선으로 잇지 않는다.

TODO(확인 필요): 실제 분모·단위·설문 시간 정의, 비교 방식·가중치·최소 문항·0일 정책을 데이터 수령 후 합의한다.
