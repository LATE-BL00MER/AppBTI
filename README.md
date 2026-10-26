# AppBTI

디지털 이용습관 설문 응답을 연령집단 통계와 비교하는 B2C 웹서비스.
한성대학교 기업연계 SW캡스톤디자인 · 팀 U+TOPIA · 협력 기업 LG U+.
결과는 자기보고 응답과 집단 통계의 유사성 비교이며, 실제 나이 추정이나 개인 이용 기록 분석이 아니다.

## 현재 구현 범위

가상 원본 → Python 수용 검사·집단 Profile → Spring API·설문 유사도 → React 화면을 연결한 로컬 프로토타입이다.
소개, 12개 중분류 설문, 결과 근거와 전체 집단 비교, 중분류·월·지표별 탐색, 데이터 안내를 제공한다.
시간 지표 유무를 데이터 안내 화면에서 전환할 수 있다. 비공개·누락은 0으로 채우지 않는다.
실제 제공처 연령 구간이 미확정이므로 **A~F 가상 6집단**으로 시연하며 실제 연령 경계를 가정하지 않는다.
응답은 브라우저 탭의 임시 저장소에만 보관하며 서버에는 저장하지 않는다.

[팀 시연 가이드](docs/DEMO.md) · [API 계약](docs/API.md)

## 폴더 구조

```text
config/                       실제 설정 틀과 시연용 별도 코드북·유사도 설정
data/mock/basic/              시간 없는 가상 원본 CSV
data/mock/with_time/          시간 있는 가상 원본 CSV
data/raw/                     실제 원본 (Git 제외)
data/processed/               파이프라인 산출물 (Git 제외)
pipeline/appbti_pipeline/     어댑터·검증·집단 지표·출력 모듈
pipeline/tests/               Python 테스트
backend/                      Spring Boot 3 · Java 21 · Gradle Wrapper
frontend/src/pages/           화면
frontend/src/components/      공통 UI
frontend/src/api/             API 연결 위치
docs/REVIEW.md                Claude Code가 리뷰 시 생성
```

`data/raw/`와 `data/processed/`는 전체가 Git에서 제외되므로 새로 복제하면 없다.
필요할 때 생성하며, 실제 원본과 파생 데이터는 커밋하지 않는다.

## 필요한 환경

- Python **3.11**
- JDK **21** (`JAVA_HOME` 또는 PATH 설정)
- Node.js **22.12 이상**과 npm
- 첫 설치 시 패키지 저장소와 Gradle 배포 서버에 접근할 네트워크

Gradle은 별도 설치 없이 포함된 Wrapper 8.14.3을 사용한다.
Spring Boot 3.5의 [빌드 도구 요구사항](https://docs.spring.io/spring-boot/3.5/system-requirements.html)에 맞췄다.
Vite의 Node.js 조건은 [공식 실행 안내](https://vite.dev/guide/)에서 확인할 수 있다.
프론트엔드 의존성은 `package-lock.json`으로 고정하며 재설치에는 `npm ci`를 사용한다.

## Windows PowerShell 실행

저장소 루트에서 Python 환경을 한 번 준비한다.

```powershell
py -3.11 -m venv pipeline/.venv
./pipeline/.venv/Scripts/python.exe -m pip install -r pipeline/requirements-dev.txt
```

Python 3.11이 없고 `uv`가 설치되어 있다면 다음 방법으로 저장소 내부에 준비할 수 있다.
`.tools/`와 `.cache/`는 Git에서 제외된다.

```powershell
$env:UV_PYTHON_INSTALL_DIR = Join-Path $PWD '.tools/python'
uv python install 3.11 --cache-dir .cache/uv
uv venv pipeline/.venv --python 3.11 --cache-dir .cache/uv
uv pip install --python pipeline/.venv/Scripts/python.exe -r pipeline/requirements-dev.txt --cache-dir .cache/uv
```

가상 원본 두 종류, 산출물과 실행용 백엔드 JAR을 준비한다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-demo.ps1
```

파이프라인만 직접 실행하려면 아래 명령을 사용한다.

```powershell
cd pipeline
./.venv/Scripts/python.exe -m appbti_pipeline --input ../data/mock/basic --out ../data/processed/mock --codebook ../config/codebook.mock.yaml
./.venv/Scripts/python.exe -m appbti_pipeline --input ../data/mock/with_time --out ../data/processed/mock-time --codebook ../config/codebook.mock.yaml
./.venv/Scripts/python.exe -m pytest --basetemp ../.cache/pytest-pipeline
```

백엔드와 프론트엔드는 각각 별도 터미널에서 실행한다.

```powershell
cd backend
java -jar build/libs/appbti-backend-0.1.0-SNAPSHOT.jar
```

```powershell
cd frontend
npm.cmd run dev
```

브라우저에서 `http://127.0.0.1:5173`을 연다. 백엔드는 8080 포트를 사용한다.
Vite는 `/api` 요청을 `http://127.0.0.1:8080`으로 전달한다.
목업 산출물을 준비하지 않았으면 API가 503 안내를 반환한다.
서버는 실행한 터미널에서 `Ctrl+C`로 종료한다.

## macOS / Linux 실행

```bash
python3.11 -m venv pipeline/.venv
pipeline/.venv/bin/python -m pip install -r pipeline/requirements-dev.txt
cd pipeline
.venv/bin/python -m appbti_pipeline --input ../data/mock/basic --out ../data/processed/mock --codebook ../config/codebook.mock.yaml
.venv/bin/python -m appbti_pipeline --input ../data/mock/with_time --out ../data/processed/mock-time --codebook ../config/codebook.mock.yaml
.venv/bin/python -m pytest
```

별도 터미널에서 각각 실행한다.

```bash
cd backend
./gradlew bootRun
```

```bash
cd frontend
npm ci
npm run dev
```

## 실제 데이터 교체와 설정

실제 코드북의 연령 구간·중분류·분모·시간 정의를 확인한 후 Python 3.11 환경에서 실행한다.

```bash
cd pipeline
python -m appbti_pipeline --input ../data/raw --out ../data/processed --codebook ../config/codebook.yaml
```

`config/codebook.yaml`은 희망 제공 컬럼 매핑을 담는다. 제공처의 연령대 6구간과
중분류 정의는 아직 비워두었다. 평균 이용일수 분모와 시간 지표의 단위·정의·분모는
`TODO(확인 필요)`로 표시했고, 관련 기능 플래그는 기본적으로 껐다.
`config/similarity.yaml`의 방식·가중치·최소 비교 개수·0일 처리도 미확정 상태다.
실제 데이터용 설정은 정의 확인 전까지 비활성화한다. 시연용으로 활성화한 값은
`codebook.mock.yaml`, `similarity.mock.yaml`에만 있다. 코드북 확장 설정은 원본 컬럼 매핑을 상속한다.

백엔드 `application.yaml`은 다음 경로를 받는다.

| 설정 | 기본값 | 환경변수 |
|---|---|---|
| `appbti.profiles-path` | `../data/processed/profiles.json` | `APPBTI_PROFILES_PATH` |
| `appbti.mock-profiles-path` | `../data/processed/mock/profiles.json` | `APPBTI_MOCK_PROFILES_PATH` |
| `appbti.mock-time-profiles-path` | `../data/processed/mock-time/profiles.json` | `APPBTI_MOCK_TIME_PROFILES_PATH` |
| `appbti.similarity-path` | `../config/similarity.yaml` | `APPBTI_SIMILARITY_PATH` |
| `appbti.mock-similarity-path` | `../config/similarity.mock.yaml` | `APPBTI_MOCK_SIMILARITY_PATH` |

상대 경로는 `backend/` 작업 디렉터리 기준이다. 실제 산출물이 없으면 가상 산출물로 대체한다.
실제 산출물 적재 시 시간 포함 가상 데이터 버전을 노출하지 않는다. 파일 교체 뒤에는 서버를 다시 시작한다.
검사에 실패하면 리포트를 남기고 이전 profiles.json을 제거하므로 실패한 데이터를 성공 결과로 쓰지 않는다.

## 커밋 전 검증

각 프로젝트 폴더에서 다음 명령을 실행한다. Windows에서는 `./gradlew.bat`,
`npm.cmd`를 사용하고 Python 가상환경을 활성화하거나 실행 파일의 경로를 지정한다.

```text
pipeline: python -m pytest
backend:  ./gradlew test bootJar
frontend: npm run build
```

로컬 서버 둘을 실행한 상태에서 `python scripts/check_demo.py`로 Vite 프록시와 두 목업 버전의
실제 HTTP 응답 26개를 확인할 수 있다. 외부 서비스나 Claude는 호출하지 않는다.

리뷰는 Claude Code가 `docs/REVIEW.md`에 작성한다. Codex는 작업 전 해당 파일이
있으면 먼저 읽고 리뷰 항목을 심각도 순서대로 반영한다.
