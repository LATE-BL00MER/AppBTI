# 저장소 루트 위치와 무관하게 가상 데이터 및 로컬 실행용 JAR을 준비한다.
$ErrorActionPreference = 'Stop'
$env:PYTHONIOENCODING = 'utf-8'
$root = Split-Path $PSScriptRoot -Parent
$python = Join-Path $root 'pipeline/.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $python)) {
    throw 'Python 3.11 가상환경을 먼저 준비하세요. README.md의 환경 설치 명령을 확인하세요.'
}
Push-Location (Join-Path $root 'pipeline')
try {
    & $python generate_mock.py
    if ($LASTEXITCODE -ne 0) { throw '가상 원본 생성 실패' }
    & $python -m appbti_pipeline --input ../data/mock/basic --out ../data/processed/mock --codebook ../config/codebook.mock.yaml
    if ($LASTEXITCODE -ne 0) { throw '기본 데이터 수용 검사 실패' }
    & $python -m appbti_pipeline --input ../data/mock/with_time --out ../data/processed/mock-time --codebook ../config/codebook.mock.yaml
    if ($LASTEXITCODE -ne 0) { throw '시간 포함 데이터 수용 검사 실패' }
} finally { Pop-Location }

$env:GRADLE_USER_HOME = Join-Path $root '.cache/gradle'
Push-Location (Join-Path $root 'backend')
try {
    & ./gradlew.bat bootJar --console=plain
    if ($LASTEXITCODE -ne 0) { throw '백엔드 빌드 실패' }
} finally { Pop-Location }

Push-Location (Join-Path $root 'frontend')
try {
    if (-not (Test-Path node_modules)) {
        & npm.cmd ci --cache (Join-Path $root '.cache/npm')
        if ($LASTEXITCODE -ne 0) { throw '프론트엔드 의존성 설치 실패' }
    }
} finally { Pop-Location }
Write-Host '데모 준비 완료. README.md의 백엔드·프론트엔드 명령을 별도 터미널에서 실행하세요.'
