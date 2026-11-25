param(
    [switch]$Mock,
    [string]$RawInput,
    [string]$CleanCsv,
    [string]$ProfilesJson,
    [int]$Port,
    [int]$ApiPort,
    [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'
$env:PYTHONIOENCODING = 'utf-8'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$root = Split-Path $PSScriptRoot
$pipeline = Join-Path $root 'pipeline'
$python = Join-Path $pipeline '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) { $python = (Get-Command python).Source }
$backendDir = Join-Path $root 'backend'
$frontendDir = Join-Path $root 'frontend'
$backendPort = if ($Mock) { 8082 } else { 8083 }
$frontendPort = if ($Mock) { 5175 } else { 5176 }
$book = Join-Path $root 'config/codebook.yaml'

function Get-PreviewPort([int]$Preferred, [int]$Requested) {
    $ports = if ($Requested) { @($Requested) } else { $Preferred..($Preferred + 20) }
    foreach ($candidate in $ports) {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $candidate)
        try { $listener.Start(); return $candidate }
        catch [System.Net.Sockets.SocketException] { }
        finally { $listener.Stop() }
    }
    throw "로컬 포트 $Preferred 주변에서 사용할 수 있는 포트를 찾지 못했습니다."
}

if ($Mock) {
    if ($RawInput -or $CleanCsv -or $ProfilesJson) { throw '-Mock과 별도 입력 경로는 함께 사용할 수 없습니다.' }
    $book = Join-Path $root 'config/codebook.mock.yaml'
    $mockOutput = Join-Path $root 'data/processed/mock-time'
    Push-Location $pipeline
    try {
        & $python -m appbti_pipeline --input (Join-Path $root 'data/mock/with_time') --codebook $book --out $mockOutput
        if ($LASTEXITCODE -ne 0) { throw '목업 프로필을 만들지 못했습니다.' }
    } finally { Pop-Location }
    $CleanCsv = Join-Path $mockOutput 'clean.csv'
    $ProfilesJson = Join-Path $mockOutput 'profiles.json'
} else {
    $dataDir = Join-Path $root 'data/processed/real'
    if ($RawInput -and ($CleanCsv -or $ProfilesJson)) { throw '-RawInput과 기존 산출물 경로는 함께 사용할 수 없습니다.' }
    if (-not $CleanCsv -and -not $ProfilesJson) {
        $CleanCsv = Join-Path $dataDir 'clean.csv'
        $ProfilesJson = Join-Path $dataDir 'profiles.json'
        if ($RawInput -or -not (Test-Path -LiteralPath $CleanCsv -PathType Leaf) -or -not (Test-Path -LiteralPath $ProfilesJson -PathType Leaf)) {
            $rawData = Join-Path $root 'data/raw/real'
            if ($RawInput) {
                $inputFile = Get-Item -LiteralPath $RawInput
                if ($inputFile.PSIsContainer -or $inputFile.Extension -notin @('.csv', '.xlsx')) { throw '-RawInput에 CSV 또는 XLSX 파일을 지정하세요.' }
            } else {
                $inputs = @(Get-ChildItem -LiteralPath $rawData -File -ErrorAction SilentlyContinue |
                    Where-Object { $_.Extension -in @('.csv', '.xlsx') -and -not $_.Name.StartsWith('~$') })
                if ($inputs.Count -ne 1) {
                    throw 'data/raw/real에 원본 파일을 하나만 두거나 -RawInput으로 파일을 지정하세요. 가상 집계는 -Mock으로 실행합니다.'
                }
                $inputFile = $inputs[0]
            }
            Push-Location $pipeline
            try {
                & $python -m appbti_pipeline --input $inputFile.FullName --out $dataDir --codebook $book *> $null
                if ($LASTEXITCODE -ne 0) { throw '실제 집계를 준비하지 못했습니다. data/raw/real과 로컬 수용 검사 결과를 확인하세요.' }
            } finally { Pop-Location }
        }
    }
    if (-not $CleanCsv) {
        $CleanCsv = Join-Path (Split-Path -Parent (Resolve-Path -LiteralPath $ProfilesJson).Path) 'clean.csv'
    }
    if (-not $ProfilesJson) {
        $ProfilesJson = Join-Path (Split-Path -Parent (Resolve-Path -LiteralPath $CleanCsv).Path) 'profiles.json'
    }
}

if (-not (Test-Path -LiteralPath $CleanCsv -PathType Leaf)) { throw "정제 CSV를 찾을 수 없습니다. -CleanCsv 로 파일 경로를 지정해 주세요. $CleanCsv" }
if (-not (Test-Path -LiteralPath $ProfilesJson -PathType Leaf)) { throw "프로필 JSON을 찾을 수 없습니다. -ProfilesJson 으로 파일 경로를 지정해 주세요. $ProfilesJson" }
$CleanCsv = (Resolve-Path -LiteralPath $CleanCsv).Path
$ProfilesJson = (Resolve-Path -LiteralPath $ProfilesJson).Path
$outputDir = Split-Path -Parent $CleanCsv
Push-Location $pipeline
try {
    & $python -m appbti_pipeline.site_data --input $CleanCsv --profiles $ProfilesJson --out $outputDir --codebook $book
    if ($LASTEXITCODE -ne 0) { throw '웹 분석 파일을 만들지 못했습니다.' }
} finally { Pop-Location }

$insights = Join-Path $outputDir 'insights.json'
$findings = Join-Path $outputDir 'findings.json'
$disabled = Join-Path $root 'data/processed/.preview-disabled.json'
$env:APPBTI_PROFILES_PATH = if ($Mock) { $disabled } else { $ProfilesJson }
$env:APPBTI_INSIGHTS_PATH = if ($Mock) { $disabled } else { $insights }
$env:APPBTI_FINDINGS_PATH = if ($Mock) { $disabled } else { $findings }
$env:APPBTI_MOCK_INSIGHTS_PATH = if ($Mock) { $insights } else { $disabled }
$env:APPBTI_MOCK_FINDINGS_PATH = if ($Mock) { $findings } else { $disabled }
$env:APPBTI_MOCK_PROFILES_PATH = if ($Mock) { $ProfilesJson } else { $disabled }
$env:APPBTI_MOCK_TIME_PROFILES_PATH = $disabled
$env:APPBTI_MOCK_TIME_INSIGHTS_PATH = $disabled
$env:APPBTI_MOCK_TIME_FINDINGS_PATH = $disabled
$backendPort = Get-PreviewPort $backendPort $ApiPort
$frontendPort = Get-PreviewPort $frontendPort $Port
$env:APPBTI_DEV_PORT = $frontendPort
$env:APPBTI_DEV_API_PORT = $backendPort

if (Test-Path -LiteralPath (Join-Path $root '.cache/gradle') -PathType Container) {
    $env:GRADLE_USER_HOME = Join-Path $root '.cache/gradle'
}
Push-Location $backendDir
try {
    & .\gradlew.bat bootJar --console=plain
    if ($LASTEXITCODE -ne 0) { throw '백엔드 빌드에 실패했습니다.' }
} finally { Pop-Location }
$jar = Get-ChildItem -LiteralPath (Join-Path $backendDir 'build/libs') -Filter '*.jar' |
    Where-Object { $_.Name -notlike '*-plain.jar' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $jar) { throw '실행할 백엔드 JAR을 찾지 못했습니다.' }
if (-not (Test-Path -LiteralPath (Join-Path $frontendDir 'node_modules/vite/bin/vite.js'))) {
    throw "프론트엔드 의존성이 필요합니다. $frontendDir 에서 npm ci를 먼저 실행해 주세요."
}

$backend = Start-Process -FilePath (Get-Command java).Source `
    -ArgumentList @('-jar', "`"$($jar.FullName)`"", '--server.address=127.0.0.1', "--server.port=$backendPort", '--logging.level.root=OFF') `
    -WorkingDirectory $backendDir -WindowStyle Hidden -PassThru
$frontend = $null
$origin = "http://127.0.0.1:$frontendPort"
try {
    $frontend = Start-Process -FilePath (Get-Command node).Source -ArgumentList 'node_modules/vite/bin/vite.js' `
        -WorkingDirectory $frontendDir -WindowStyle Hidden -PassThru
    for ($attempt = 0; $attempt -lt 35; $attempt++) {
        if ($backend.HasExited -or $frontend.HasExited) { break }
        try {
            $insightsCheck = Invoke-WebRequest -UseBasicParsing -Uri "$origin/api/insights?dataset=basic" -Method Get -TimeoutSec 2
            $findingsCheck = Invoke-WebRequest -UseBasicParsing -Uri "$origin/api/findings?dataset=basic" -Method Get -TimeoutSec 2
            if ($insightsCheck.StatusCode -eq 200 -and $findingsCheck.StatusCode -eq 200) {
                if (-not $NoOpen) { Start-Process "$origin/" }
                Write-Output "$origin/"
                return
            }
        } catch { Start-Sleep -Milliseconds 350 }
    }
    throw '미리보기 연결에 실패했습니다. 이전 미리보기가 실행 중이면 종료한 뒤 다시 시도해 주세요.'
} catch {
    if ($frontend -and -not $frontend.HasExited) { Stop-Process -Id $frontend.Id }
    if (-not $backend.HasExited) { Stop-Process -Id $backend.Id }
    throw
}
