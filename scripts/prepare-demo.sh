#!/usr/bin/env bash
# 실행 위치와 무관하게 가상 데이터와 로컬 시연용 JAR을 준비한다.
set -euo pipefail

fail() {
    printf '오류: %s\n' "$1" >&2
    exit 1
}

if ! root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"; then
    fail '저장소 루트를 찾지 못했습니다.'
fi
python="$root/pipeline/.venv/bin/python"
use_real=false
for option in "$@"; do
    case "$option" in
        --real) use_real=true ;;
        *) fail "알 수 없는 옵션: $option (사용법: scripts/prepare-demo.sh [--real])" ;;
    esac
done

if [[ ! -x "$python" ]]; then
    printf '%s\n' 'Python 3.11 가상환경을 먼저 준비하세요. README.md의 macOS / Linux 실행 절을 확인하세요.' >&2
    printf 'cd "%s"\n' "$root" >&2
    printf '%s\n' 'python3.11 -m venv pipeline/.venv' \
        'pipeline/.venv/bin/python -m pip install -r pipeline/requirements-dev.txt' >&2
    exit 1
fi

if [[ "$use_real" == true ]]; then
    has_csv=false
    for csv in "$root"/data/raw/real/*.[cC][sS][vV]; do
        if [[ -f "$csv" ]]; then
            has_csv=true
            break
        fi
    done
    if [[ "$has_csv" == false ]]; then
        fail 'data/raw/real/에 CSV가 없습니다. 실제 데이터는 저장소 밖 ~/appbti-data/raw/real/에 두고 Orca 설정 스크립트로 data/raw/에 복사한다(AGENTS.md 12장).'
    fi
fi

run_step() {
    local label="$1"
    local directory="$2"
    shift 2
    printf '%s 진행 중…\n' "$label"
    if ! (cd -- "$directory" && "$@"); then
        fail "$label 실패"
    fi
}

export PYTHONIOENCODING=utf-8
run_step '가상 원본 생성' "$root/pipeline" "$python" generate_mock.py
run_step '기본 데이터 수용 검사' "$root/pipeline" "$python" -m appbti_pipeline \
    --input ../data/mock/basic --out ../data/processed/mock --codebook ../config/codebook.mock.yaml
run_step '시간 포함 데이터 수용 검사' "$root/pipeline" "$python" -m appbti_pipeline \
    --input ../data/mock/with_time --out ../data/processed/mock-time --codebook ../config/codebook.mock.yaml

if [[ "$use_real" == true ]]; then
    # 실제 데이터 수치가 터미널 출력이나 로그에 남지 않도록 한다.
    printf '%s\n' '실제 데이터 수용 검사 진행 중…'
    if ! (cd -- "$root/pipeline" && "$python" -m appbti_pipeline \
        --input ../data/raw/real --out ../data/processed/real --codebook ../config/codebook.yaml) >/dev/null 2>&1; then
        fail '실제 데이터 수용 검사 실패. 코드북 설정과 data/processed/real/validation_report.json을 로컬에서 확인하세요.'
    fi
fi

export GRADLE_USER_HOME="$root/.cache/gradle"
run_step '백엔드 빌드' "$root/backend" ./gradlew bootJar --console=plain
if [[ ! -d "$root/frontend/node_modules" ]]; then
    run_step '프론트엔드 의존성 설치' "$root/frontend" npm ci --cache "$root/.cache/npm"
fi

printf '%s\n' '데모 준비 완료. 별도 터미널에서 각각 실행하세요.'
printf 'cd "%s/backend" && java -jar build/libs/appbti-backend-0.1.0-SNAPSHOT.jar\n' "$root"
if [[ "$use_real" == true ]]; then
    printf '%s\n' '실제 산출물로 실행하려면 위 백엔드 명령의 java 앞에 APPBTI_PROFILES_PATH=../data/processed/real/profiles.json을 지정하세요.'
fi
printf 'cd "%s/frontend" && npm run dev\n' "$root"
