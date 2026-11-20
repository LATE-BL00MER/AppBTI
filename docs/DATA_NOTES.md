# DATA_NOTES — 실제 데이터 처리 메모

> 실제 수치는 쓰지 않는다. 현상과 처리 규칙만 적는다(AGENTS.md 데이터 보안).

## 입력
- LG U+ 원본 CSV를 **받은 그대로** `data/raw/real/`에 둔다(커밋 금지, 폴더에 CSV 하나만).
- 파이프라인이 원본을 직접 읽어 정제한다. 따로 만든 `clean.csv`는 필요 없고, 파이프라인이 `data/processed/real/clean.csv`로 함께 내보낸다.
- 실행: `cd pipeline && python -m appbti_pipeline --input ../data/raw/real --out ../data/processed/real --codebook ../config/codebook.yaml`
- 산출물: `profiles.json`(백엔드용), `clean.csv`(표준 열 정제 표), `minor_codes.csv`(중분류 코드표, 제외 여부 포함), `validation_report.json`(검사·상태·제외 내역)

## 정제 규칙 (`config/codebook.yaml` + `pipeline/appbti_pipeline/adapter.py`)
| 항목 | 규칙 |
|---|---|
| 열 이름 | `P_YYYYMM`→month, `YY10_AGLV_ID`→age_group, `CNC_INFO_CATG_LVL1_NM`→major, `CNC_INFO_CATG_LVL2_NM`→minor_name, `UNQ_USER_CNT`→uu, `AVG_TADV_DAYS`→avg_days, `AVG_ASMP_VSIT_TM`→avg_daily_time |
| 기준월 | `YYYYMM` → `YYYY-MM` |
| 연령대 | 라벨(`20대 미만` 등) → ID(`under20` 등). 순서는 코드북 목록 순서 |
| 중분류 코드 | 원본에 없으므로 코드북 이름으로 부여. 코드는 한 번 정하면 바꾸지 않는다 |
| 상태(status) | 원본에 없으므로 값으로 판정: 값이 있으면 `normal`, 이용자 수 0이면 `suppressed`, 이용자 수·이용일수가 비어 있으면 `missing`. **0으로 채우지 않는다** |
| 이용시간 단위 | 원본에 단위 열이 없다. LG U+ 답변대로 분(`minutes`)으로 읽는다(코드북 `metrics.daily_time.source_unit`) |

## 제외: 안전민감
- **현상**: 이용자 수 0과 빈 값(이용일수·이용시간)이 이 중분류에 몰려 있고, 아래 빠진 조합 2건도 모두 이 중분류다.
- **처리**: 코드북 `exclude_minor_names`로 읽을 때 제외한다. 제외한 행 수, 이용자 수 0 행 수, 빈 값 행 수, 빠진 조합은 `validation_report.json`의 `excluded`에 남는다. 코드표(`minor_codes.csv`)에는 `excluded=true`로 남긴다.
- **사유**: 값이 대부분 없거나 0이라 연령대 비교·설문 기준값을 만들 수 없다. 0으로 채워 비교하면 실제보다 적게 쓰는 것처럼 보인다.

## 빠진 조합 (6개월 × 6연령대 × 105중분류 기준)
| 기준월 | 연령대 | 중분류 |
|---|---|---|
| 2025-01 | 20대 미만 | 안전민감 |
| 2025-05 | 60대 이상 | 안전민감 |

두 조합 모두 제외 대상이라, 제외 후 분석 대상(104개 중분류)에는 빠진 조합이 없다.

## 지표 정의 (LG U+ 답변 기준, API v2)
| 원본 열 | 정의 | 쓰는 방식 |
|---|---|---|
| `AVG_TADV_DAYS` | 이용자 1명당 월 평균 이용일수 | ÷ 그 달 일수 → 이용일 비율 |
| `AVG_ASMP_VSIT_TM` | 이용자 1명당 일평균 이용시간(분) | 분 그대로 |
| `UNQ_USER_CNT` | 월간 유니크 이용자 수 | 연령 구성비(탐색 화면)만. 중분류 간 합산 금지 |

## 확인 중 (TODO)
- 일평균 이용시간의 '하루' 기준(이용한 날 / 그달 전체 일수): LG U+ 재확인 중. 두 버전을 설정으로 고를 수 있다.
  - 이용한 날 기준(기본): `config/codebook.yaml`, `similarity.yaml`, `survey_questions.yaml`
  - 그달 전체 일수 기준(후자): `config/codebook.calendar_days.yaml`, `similarity.calendar_days.yaml`, `survey_questions.calendar_days.yaml`.
    설문 기준값의 시간 항목을 쓴 날 사용량(일평균 시간 × 그달 일수 ÷ 월 평균 이용일수)으로 환산하고, 시간 선택지 경계를 10·30·60·120분으로 올린다.
  - 후자로 실행: 파이프라인 `--codebook ../config/codebook.calendar_days.yaml`, 백엔드 `APPBTI_SIMILARITY_PATH=../config/similarity.calendar_days.yaml APPBTI_SURVEY_QUESTIONS_PATH=../config/survey_questions.calendar_days.yaml`
- 이용자 수 0의 의미(소수 이용자 비공개 여부): 확정 전에도 `suppressed`로 두고 0으로 채우지 않는다
