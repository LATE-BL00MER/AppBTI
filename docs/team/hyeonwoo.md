# 차현우 (데이터) — 데이터 정제·파이프라인

> 공통 규칙은 `AGENTS.md`. 이 파일은 내 할 일만 적는다. 데이터 설명은 AGENTS.md 5장.

## 목표
받은 실제 CSV를 기존 파이프라인에 통과시켜, 백엔드가 바로 읽을 수 있는 산출물을 만든다.

## 준비
- 실제 CSV를 로컬 `data/raw/real/`에 둔다 (커밋 금지, 폴더에 CSV 하나만)

## 회의 전 (11/10까지)
- [ ] **11/09 LG U+ 문의 발송**: ① `AVG_ASMP_VSIT_TM` 단위·정의(일평균인지, 이용자 기준인지) ② `AVG_TADV_DAYS` 분모(해당 중분류 이용자 기준인지) ③ 안전민감 UU 0의 의미(비공개인지 실제 0인지)
- [ ] `config/codebook.yaml` 작성
  - columns 매핑 (AGENTS.md 5장 표), month 형식 변환 (202501 → 2025-01)
  - age_groups 6개 (ID·라벨·정렬 순서)
  - minor_categories 105개: 영문 코드(예: ott, sns)·이름·소속 대분류. 코드표를 CSV로도 출력
  - major_categories 14개
  - 시간 지표: `daily_time.enabled: true`, source_unit·definition은 `TODO(확인 필요)`
- [ ] `pipeline/appbti_pipeline/adapter.py` 수정
  - status 컬럼이 없으면 값이 있는 행은 정상, UU 0 또는 빈 값은 결측/비공개로 표시 (0으로 채우지 않음)
  - minor_code가 없으면 코드북으로 부여, 영문 컬럼명에서도 동작
- [ ] '안전민감' 제외를 설정으로 추가, 제외 사유와 빠진 조합 2건을 `docs/DATA_NOTES.md`에 기록 (수치는 쓰지 않고 현상만)
- [ ] **11/10 우서현에게 정제 CSV 전달** (`data/processed/real/clean.csv`: 표준 컬럼명, 안전민감 제외). 저장소가 아니라 단톡·드라이브로 전달
- [ ] 회의 안건 7(이용시간 지표) 보고 준비: LG U+ 답변 여부, 답변 전이면 보조 지표로 쓰는 안

## 회의 후
- [ ] 11/11 파이프라인 실행 → `data/processed/real/` 산출물 → **임기범에게 전달**. pytest에 실제 형식 테스트 추가 (가상 샘플 사용)
- [ ] 11/12 LG U+ 답변이 오면 시간 단위 반영
- [ ] 11/13 노션 '사용한 데이터 모음'용 데이터 명세 (컬럼 설명, 범위, 결측, 제외 규칙)

## 받는 것 / 주는 것
- 줌: 우서현 → 정제 CSV (11/10), 임기범 → 산출물 (11/11)

## 완료 기준
- `python -m appbti_pipeline --input ../data/raw/real --out ../data/processed/real --codebook ../config/codebook.yaml` 실행 성공
- pytest 통과, 검증 리포트에 결측·제외 내역이 나온다
