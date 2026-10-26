# AppBTI

디지털 이용습관 설문 응답을 연령집단 통계와 비교하는 B2C 웹서비스.
한성대학교 기업연계 SW캡스톤디자인 · 팀 U+TOPIA · 협력 기업 LG U+.
결과는 자기보고 응답과 집단 통계의 유사성 비교이며, 실제 나이 추정이나 개인 이용 기록 분석이 아니다.

## 현재 구현 범위

AGENTS.md 3장 **1단계(뼈대)**: 폴더 구조, 프로젝트 실행 진입점, 빌드 설정,
기본 화면, 개발 프록시와 데이터 제외 규칙을 준비했다.
목업 데이터는 2단계, 데이터 처리와 `profiles.json` 출력은 3단계,
산출물 적재·API·유사도는 4단계, 화면 기능은 5단계부터 구현한다.
현재 백엔드는 데이터 파일 없이 기동하며 `/api/*`는 아직 제공하지 않는다.
React Router와 Recharts는 화면·차트 구현 단계에서 추가한다.

## 폴더 구조

```text
config/                       코드북·유사도 설정 틀
data/mock/                    커밋 가능한 가상 원본 (2단계에서 추가)
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

파이프라인 진입점을 확인한다.

```powershell
cd pipeline
./.venv/Scripts/python.exe -m appbti_pipeline --help
./.venv/Scripts/python.exe -m pytest
```

백엔드와 프론트엔드는 각각 별도 터미널에서 실행한다.

```powershell
cd backend
./gradlew.bat bootRun
```

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

브라우저에서 `http://127.0.0.1:5173`을 연다. 백엔드는 8080 포트를 사용한다.
Vite는 `/api` 요청을 `http://127.0.0.1:8080`으로 전달한다.
1단계에서는 API가 없어 해당 경로가 404를 반환한다.
서버는 실행한 터미널에서 `Ctrl+C`로 종료한다.

## macOS / Linux 실행

```bash
python3.11 -m venv pipeline/.venv
pipeline/.venv/bin/python -m pip install -r pipeline/requirements-dev.txt
cd pipeline
.venv/bin/python -m appbti_pipeline --help
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

## 후속 단계의 데이터 실행 명령 및 설정

3단계 구현 후에는 Python 3.11 가상환경을 활성화하고 아래 명령을 사용한다.
현재는 미구현 안내와 종료 코드 2를 반환하며 파일을 생성하지 않는다.

```bash
cd pipeline
python -m appbti_pipeline --input ../data/mock --out ../data/processed
```

`config/codebook.yaml`은 희망 제공 컬럼 매핑을 담는다. 제공처의 연령대 6구간과
중분류 정의는 아직 비워두었다. 평균 이용일수 분모와 시간 지표의 단위·정의·분모는
`TODO(확인 필요)`로 표시했고, 관련 기능 플래그는 기본적으로 껐다.
`config/similarity.yaml`의 방식·가중치·최소 비교 개수·0일 처리도 미확정 상태다.
이 파일들을 읽는 처리는 3~4단계에서 구현한다.

백엔드 `application.yaml`에는 4단계 적재 구현에 사용할 경로를 준비했다.

| 설정 | 기본값 | 환경변수 |
|---|---|---|
| `appbti.profiles-path` | `../data/processed/profiles.json` | `APPBTI_PROFILES_PATH` |
| `appbti.mock-profiles-path` | `../data/mock/mock_profiles.json` | `APPBTI_MOCK_PROFILES_PATH` |

상대 경로는 `backend/` 작업 디렉터리 기준이다. 목업 산출물은 아직 없다.
실제 산출물이 없을 때 목업으로 대체하는 로직은 4단계에서 추가한다.

## 커밋 전 검증

각 프로젝트 폴더에서 다음 명령을 실행한다. Windows에서는 `./gradlew.bat`,
`npm.cmd`를 사용하고 Python 가상환경을 활성화하거나 실행 파일의 경로를 지정한다.

```text
pipeline: python -m pytest
backend:  ./gradlew test bootJar
frontend: npm run build
```

리뷰는 Claude Code가 `docs/REVIEW.md`에 작성한다. Codex는 작업 전 해당 파일이
있으면 먼저 읽고 리뷰 항목을 심각도 순서대로 반영한다.
