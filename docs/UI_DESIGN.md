# AppBTI 화면 개선 기록

2026-10-27 · Taste Skill `design-taste-frontend` 적용.

## 방향과 근거

- 앱 스타일: **Achromatic ledger**, seed `464908665`. 설문·결과·탐색은 짧게 방문해서 근거를 읽는 리포트이므로, 조용한 표면 위에서 수치와 비교를 먼저 읽게 한다.
- 소개 구성: **The product performs**, seed `810716587`. 앱 화면 흐름에 맞춰 첫 화면에서 집단을 바꾸며 실제 API 응답을 탐색한다. 별도의 홍보용 사진이나 스크롤 연출을 추가하지 않았다.
- 공통 얼굴: 낮은 채도의 청회색 바탕, 검은 탐색·선택 상태, 통계 막대의 파란색. 기존 AppBTI 막대 로고를 유지한다.
- 한 문장 아이디어: **AppBTI의 중분류별 월평균 이용일수가 집단을 바꾸며 읽는 ‘한 달의 패턴’이 된다.**
- 직접 해볼 일: 소개에서 A~F집단 선택 → 해당 집단의 통계 갱신 → 예시 응답 결과 체험 또는 직접 설문 작성.
- 글꼴은 한국어 서비스를 위해 기존 Pretendard 계열을 실제 로컬 파일로 제공한다. 앱 시트의 라틴 전용 글꼴 대신 동일한 한글·숫자 체계를 쓴다. 스타일 재추첨은 하지 않았다.

## 데이터와 화면의 질문

1. 원본은 2025년 1~6월 월간 집계이며, 현재는 명시적으로 표시한 가상 데이터다.
2. 집단 수·분야·중분류 이름은 `/api/meta`를 따른다. A~F를 실제 연령대로 해석하지 않는다.
3. 소개의 막대는 최신월의 각 분야 첫 중분류다. 분야 전체의 합계나 평균을 뜻하지 않는다.
4. 막대의 양 끝은 0일과 해당 기준월 일수다. 실제 평균일수에 비례해 길이를 정한다.
5. 미제공·비공개 값은 `데이터 없음`, 로딩 중 값은 `불러오는 중`이다. 0으로 채우지 않는다.
6. 설문은 0일과 무응답을 구분하고, 기존 대표 일수·시간 조건·비교 정책을 유지한다.
7. 결과에서는 점수보다 집단과 닮은/다른 중분류 근거를 함께 읽는다.
8. 탐색은 중분류·기준월·지표를 선택하고, 수치 표와 월별 변화로 이어진다.
9. 시간 지표는 API에서 제공될 때만 표시한다. 데이터 조건을 바꾸면 기존 응답을 초기화한다.
10. 범위·출처, 예시 데이터 배지, 응답 임시 저장 안내를 유지한다.

| 화면 | 첫 질문 | 주요 변경 |
| --- | --- | --- |
| 소개 | 내 습관은 어떤 집단의 통계와 닮았을까? | 집단 선택이 동작하는 실제 통계 미리보기 |
| 설문 | 이 활동을 한 달에 며칠 이용했을까? | 큰 선택지, 선명한 선택 상태, 모바일 분야 드롭다운 |
| 결과 | 무엇이 닮았고 무엇이 달랐을까? | 집단·점수 위계, 근거 막대와 숫자의 정렬 |
| 탐색 | 같은 활동의 집단별 차이와 월별 변화는? | 한 색 계열과 선 패턴, 균등 눈금, 모바일 중분류 선택 |
| 데이터 안내 | 이 숫자는 어디까지 해석할 수 있을까? | 가상 데이터 안내·조건 전환·정의·FAQ의 읽기 순서 |

## 시각 점검

### ROUND 0

Seen in one second: 큰 홍보 문구와 기울어진 관찰 노트.

Idea (one sentence): 일상을 기록한 노트로 통계를 소개한다.

Live thing: 설문 시작과 예시 결과 이동. 노트의 집단은 고정.

Layout words by section: hero=문구와 노트 / scope=통계 범위 띠 / guide=설명과 기능 목록.

Scores: design 6.0 · usability 6.5 · creativity 6.0 · content 8.0 → overall 6.0.

Caps applied: 앱 검사에서 그림자·11px 미만 글씨 FAIL이 있어 전체 6.0 상한 적용. 이 점수는 자체 시각 평가이며 외부 심사 점수가 아니다.

Top three problems (most visible first), each with the screenshot it shows in and the fix:

1. `before/mobile-fold.jpg`: 안내·출처가 작다. 본문과 선택지는 13~16px, 출처와 보조 정보는 11~12px 이상으로 정리한다.
2. `before/desktop-fold.jpg`: 노트의 회전·그림자가 비교 데이터보다 강조된다. 평평한 통계 작업 영역으로 바꾼다.
3. `before/tablet-fold.jpg`: 고정 집단의 장식적 미리보기다. 실제 집단 선택과 통계 갱신을 연결한다.

### ROUND 1

Seen in one second: 집단을 바꾸며 비교하는 AppBTI 통계 미리보기.

Idea (one sentence): 중분류별 월평균 이용일수를 집단별 한 달의 패턴으로 읽는다.

Live thing: 집단 선택과 예시 결과, 설문, 중분류·월·지표 필터가 동작한다.

Layout words by section: intro=질문과 설문 시작 / preview=집단 선택과 실제 막대 / guide=결과 의미와 참여 순서.

Scores: design 7.3 · usability 7.7 · creativity 7.1 · content 8.3 → overall 7.5.

Caps applied: 앱 화면 기준을 적용하므로 홍보 페이지의 사진·모션 개수 하한은 적용하지 않는다.

Top three problems (most visible first), each with the screenshot it shows in and the fix:

1. `after-survey/mobile-fold.jpg`: 여섯 분야 버튼이 문항을 아래로 밀어낸다. 모바일·태블릿에서 같은 동작의 분야 드롭다운으로 바꿨다.
2. `after-survey/mobile-fold.jpg`: 숨긴 줄바꿈 앞뒤 단어가 붙는다. 원문에 공백을 넣어 바로잡았다.
3. `after-home/mobile-fold.jpg`: 앱 진입 제목이 30px로 크다. 모바일은 24px로 줄였다.

### ROUND 2 — 최종

Seen in one second: 통계 미리보기와 설문 진입이 연결된 AppBTI.

Idea (one sentence): 개인 기록을 수집하지 않고, 스스로 답한 한 달과 집단 통계의 패턴을 비교한다.

Live thing: 집단 전환·설문·결과·탐색·시간 조건 전환·실패 후 재시도.

Layout words by section: intro=질문 / preview=집단과 막대 / result=집단과 근거 / explore=지표와 변화.

Scores: design 7.5 · usability 8.0 · creativity 7.2 · content 8.3 → overall 7.7.

Caps applied: 필수 오류 없음. 위 점수는 자체 시각 평가다.

Top three problems (most visible first), each with the screenshot it shows in and the fix:

1. `final-survey/mobile-page-01.jpg`: 대표 일수·비교 정책 같은 보조 설명이 많다. 의미를 누락하지 않도록 12px 보조 위계로 유지했다.
2. `final-explore/mobile-page-01.jpg`: 여섯 집단 수치 표는 한 화면에 모두 담기 어렵다. 표 내부 스크롤과 고정 첫 열을 제공하고 페이지 가로 넘침은 막았다.
3. `final-data/desktop-page-01.jpg`: 정의와 FAQ까지 모두 첫 화면에 들어가지 않는다. 설명 문서를 압축해 가독성을 잃기보다 읽기 순서대로 이어지도록 유지했다.

## 검증 결과와 허용 사유

- 최종 `npm.cmd run build` 성공. 새 npm 의존성 없음.
- Taste Skill 소스 검사: **0 FAIL, 0 WARN**.
- 배포용 빌드를 Vite preview(4173)로 제공하고, 소개·설문·탐색·데이터 안내를 각각 **1440 / 768 / 390px**에서 검사했다. 네 화면 모두 **0 FAIL**. 생성된 첫 화면·전체 페이지 이미지도 세 크기 모두 확인했다.
- 소개: **0 WARN**. 설문·탐색: 각각 작은 보조 글씨 비중 WARN 1개. 날짜·범위·출처·선택지의 보조 일수·축 눈금만 11~12px로 유지하며, 주 문항·선택지·주 데이터는 13px 이상이다.
- 데이터 안내: 아래쪽 정의·FAQ 블록의 `below-fold` WARN 1개. 긴 설명 문서이므로 첫 화면에 전부 압축하지 않는다.
- 탐색의 `--allow edge-text`: Recharts의 `#recharts_measurement_span`이 `top: -20000px; left: 0; aria-hidden=true`인 글꼴 측정용 요소인데 검사기가 화면 가장자리 본문으로 오인했다. 실제 차트 라벨·모바일 화면에는 잘림이 없음을 확인했다. 측정 요소나 검사기 코드를 수정하지 않았다.
- 실제 브라우저 동작 검증 **73개 통과**: 세 폭의 화면·가로 넘침, 집단 선택 수치 갱신, 로컬 글꼴, 예시 결과, 예시 응답 초기화, 0일·무응답 구분, 분야 이동, 비교 부족, 지표 전환, 비공개 구성비, 시간 포함/미포함, 모바일 메뉴, JS 예외, 모션 감소 설정, 미리보기 실패·재시도.
- 결과는 실제 API 제출 뒤의 화면을 세 폭에서 캡처했다. 독립적인 빈 `/result` 접속 대신 예시 결과와 비교 부족 두 상태를 각각 검증했다.
- `scripts/check_demo.py`: **26개 HTTP 검사 통과**. 기존 두 목업 버전과 프록시·유사도·결측 처리를 확인했다.
- 이미지와 브라우저 실행 기록은 Git 제외 경로 `.cache/taste/`에 저장했다. 실제 LG U+ 데이터는 사용하지 않았다. 기존 사용자 수정분 `scripts/review.ps1`은 변경하지 않았다.

## 자산 출처

외부 사진·영상·생성 이미지는 사용하지 않았다. AppBTI 로고와 데이터 차트는 기존 코드·실제 API 응답을 사용한다. A~F 집단·중분류명·목업 값은 실제 코드북과 통계 수령 후 교체해야 한다.

- 글꼴: [Pretendard v1.3.9](https://github.com/orioncactus/pretendard/tree/v1.3.9), Kil Hyung-jin. **SIL Open Font License 1.1**.
- 원본: `packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2`. 변경 없이 `frontend/public/fonts/`에 포함한다.
- 라이선스 전문: `frontend/public/fonts/OFL.txt`.
- SHA-256: `9599F12FD42FC0BCE1CD50B47A0C022E108D7AA64DD0D1BB0ED44F3282D900B4`.
