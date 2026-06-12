# Local test runner — mirrors .github/workflows/ci.yml on Windows.
# Usage: .\scripts\local-test.ps1 [command] [-NoCov]
#   (default) all        — Postgres + migrations + Python + web checks
#   python               — DB + pytest + CLI smoke only
#   reporting            — reporting module 100% coverage gate (CI step)
#   tools                — tools module coverage gate
#   web                  — typecheck, lint, vitest (no Postgres)
#   quick                — pytest -NoCov + web (DB must already be running)
#   help                 — show commands
# Requires: PowerShell 5.1+ (PowerShell 7+ recommended for reliable exit codes)

$ErrorActionPreference = "Stop"

$ROOT = Split-Path -Parent $PSScriptRoot
Set-Location $ROOT

$PG_CONTAINER = if ($env:WP_PG_CONTAINER) { $env:WP_PG_CONTAINER } else { "wp-pg" }
$PG_IMAGE = if ($env:WP_PG_IMAGE) { $env:WP_PG_IMAGE } else { "postgres:16-alpine" }
$PG_PORT = if ($env:WP_PG_PORT) { $env:WP_PG_PORT } else { "5432" }
$PG_USER = if ($env:WP_PG_USER) { $env:WP_PG_USER } else { "postgres" }
$PG_PASSWORD = if ($env:WP_PG_PASSWORD) { $env:WP_PG_PASSWORD } else { "dev" }
$PG_DB = if ($env:WP_PG_DB) { $env:WP_PG_DB } else { "website_profiling" }

if (-not $env:DATABASE_URL) {
    $env:DATABASE_URL = "postgres://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/${PG_DB}"
}
if (-not $env:DATA_DIR) {
    $env:DATA_DIR = Join-Path $ROOT "data"
}

$VENV = Join-Path $ROOT ".venv"
$VENV_PYTHON = Join-Path $VENV "Scripts\python.exe"
$VENV_PIP = Join-Path $VENV "Scripts\pip.exe"
$VENV_PYTEST = Join-Path $VENV "Scripts\pytest.exe"
$VENV_ALEMBIC = Join-Path $VENV "Scripts\alembic.exe"
$WEB = Join-Path $ROOT "web"

$env:WEBSITE_PROFILING_ROOT = $ROOT
if ($env:PYTHONPATH) {
    $env:PYTHONPATH = "$($env:PYTHONPATH);$(Join-Path $ROOT 'src')"
} else {
    $env:PYTHONPATH = Join-Path $ROOT "src"
}

$PytestNoCov = $false

function Write-Log([string]$Message) {
    Write-Host "-> $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
    Write-Host "OK $Message" -ForegroundColor Green
}

function Write-Warn([string]$Message) {
    Write-Host "! $Message" -ForegroundColor Yellow
}

function Write-Die([string]$Message) {
    Write-Host "X $Message" -ForegroundColor Red
    exit 1
}

function Assert-LastExitCode([string]$Message) {
    $failed = $false
    if ($PSVersionTable.PSVersion.Major -ge 7) {
        $failed = ($LASTEXITCODE -ne 0)
    } else {
        $failed = (-not $?)
    }
    if ($failed) {
        Write-Die $Message
    }
}

function Test-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Write-Die "Missing required command: $Name"
    }
}

function Get-PythonLauncher {
    foreach ($cmd in @("python", "python3", "py")) {
        if (Get-Command $cmd -ErrorAction SilentlyContinue) {
            if ($cmd -eq "py") {
                return ,@("py", "-3")
            }
            return ,@($cmd)
        }
    }
    Write-Die "Missing required command: python (install Python 3.11+ and ensure it is on PATH)"
}

function Invoke-PythonLauncher {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Launcher,
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$PythonArgs
    )

    if ($Launcher.Count -gt 1) {
        & $Launcher[0] $Launcher[1] @PythonArgs
    } else {
        & $Launcher[0] @PythonArgs
    }
    Assert-LastExitCode "Python command failed: $($Launcher -join ' ') $($PythonArgs -join ' ')"
}

function Get-DockerContainerNames {
    param([switch]$All)

    $dockerArgs = if ($All) { @("ps", "-a") } else { @("ps") }
    $output = & docker @dockerArgs --format "{{.Names}}" 2>$null
    if (-not $output) {
        return @()
    }
    return @($output | ForEach-Object { "$_".Trim() } | Where-Object { $_ })
}

function Test-DockerRunning {
    Test-Command docker
    $prevErrorAction = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        cmd /c "docker info >nul 2>&1"
    } finally {
        $ErrorActionPreference = $prevErrorAction
    }
    Assert-LastExitCode "Docker is not running. Start Docker Desktop, then retry."
}

function Test-ContainerExists([string]$Name) {
    return (Get-DockerContainerNames -All) -contains $Name
}

function Test-ContainerRunning([string]$Name) {
    return (Get-DockerContainerNames) -contains $Name
}

function Wait-ForPostgres {
    for ($i = 1; $i -le 30; $i++) {
        & docker exec $PG_CONTAINER pg_isready -U $PG_USER -d $PG_DB *> $null
        if ($PSVersionTable.PSVersion.Major -ge 7) {
            if ($LASTEXITCODE -eq 0) { return }
        } elseif ($?) {
            return
        }
        Start-Sleep -Seconds 1
    }
    Write-Die "Postgres did not become ready in time (container: $PG_CONTAINER)"
}

function Invoke-Db {
    Test-DockerRunning
    if (Test-ContainerExists $PG_CONTAINER) {
        if (Test-ContainerRunning $PG_CONTAINER) {
            Write-Log "Postgres already running ($PG_CONTAINER)"
        } else {
            Write-Log "Starting existing container $PG_CONTAINER"
            & docker start $PG_CONTAINER *> $null
            Assert-LastExitCode "Failed to start container $PG_CONTAINER"
        }
    } else {
        Write-Log "Creating Postgres container $PG_CONTAINER on port $PG_PORT"
        & docker run -d --name $PG_CONTAINER `
            -e "POSTGRES_PASSWORD=$PG_PASSWORD" `
            -e "POSTGRES_DB=$PG_DB" `
            -p "${PG_PORT}:5432" `
            $PG_IMAGE *> $null
        Assert-LastExitCode "Failed to create Postgres container $PG_CONTAINER"
    }
    Wait-ForPostgres
    Write-Log "DATABASE_URL=$($env:DATABASE_URL)"
}

function Invoke-Venv {
    $pyLauncher = Get-PythonLauncher
    if (-not (Test-Path $VENV_PYTHON)) {
        Write-Log "Creating Python venv at .venv"
        Invoke-PythonLauncher -Launcher $pyLauncher -PythonArgs @("-m", "venv", $VENV)
    }
    if (-not (Test-Path $VENV_PYTEST)) {
        Write-Log "Installing Python dependencies"
        & $VENV_PIP install -q -r (Join-Path $ROOT "requirements.txt")
        Assert-LastExitCode "Failed to install requirements.txt"
    }
}

function Invoke-Migrate {
    Invoke-Db
    if (-not (Test-Path $VENV_ALEMBIC)) {
        Invoke-Venv
    }
    Write-Log "Applying database migrations (alembic upgrade head)"
    & $VENV_ALEMBIC upgrade head
    Assert-LastExitCode "Database migration failed (alembic upgrade head)"
}

function Invoke-WebDeps {
    Test-Command npm
    $nodeModules = Join-Path $WEB "node_modules"
    if (-not (Test-Path $nodeModules)) {
        Write-Log "Installing web dependencies (npm ci)"
        Push-Location $WEB
        try {
            & npm ci
            Assert-LastExitCode "Failed to install web dependencies (npm ci)"
        } finally {
            Pop-Location
        }
    }
}

function Invoke-PytestCore {
    if ($PytestNoCov) {
        Write-Log "Pytest (tests/ -q -m not browser --no-cov)"
        & $VENV_PYTEST tests/ -q -m "not browser" --no-cov
    } else {
        Write-Log "Pytest (tests/ -q -m not browser, 100% coverage gate)"
        & $VENV_PYTEST tests/ -q -m "not browser"
    }
    Assert-LastExitCode "Core pytest failed"
}

function Invoke-PytestReporting {
    Write-Log "Pytest (reporting coverage gate, 100%)"
    & $VENV_PYTEST `
        tests/test_categories_roadmap.py `
        tests/test_report_categories_golden.py `
        tests/test_categories_coverage.py `
        tests/test_contrast_issues.py `
        tests/test_indexation_coverage.py `
        tests/test_crawl_segments.py `
        tests/test_terminology.py `
        tests/test_compare_payload.py `
        tests/test_optional_audits.py `
        tests/test_property_profile.py `
        tests/test_reporting_gaps.py `
        tests/test_text_content_analysis.py `
        tests/test_builder_image_buckets.py `
        tests/test_pipeline_report_pool_unit.py `
        tests/test_reporting_builder_modules.py `
        --cov=website_profiling.reporting `
        --cov-config=.coveragerc.reporting `
        --cov-report=term-missing `
        --cov-fail-under=100 `
        -q `
        -o addopts=
    Assert-LastExitCode "Reporting coverage gate failed"
}

function Invoke-PytestTools {
    Write-Log "Pytest (tools coverage gate, 100%)"
    & $VENV_PYTEST `
        tests/test_alert_checker.py `
        tests/test_schedule_runner.py `
        tests/test_export_audit.py `
        tests/test_export_audit_coverage.py `
        tests/test_audit_tools.py `
        tests/test_audit_tools_expanded.py `
        tests/test_audit_tools_coverage.py `
        tests/test_audit_tools_dispatch_coverage.py `
        tests/test_audit_tools_links_extras.py `
        tests/test_audit_tools_expansion.py `
        tests/test_audit_tools_expansion_coverage.py `
        tests/test_export_custom_coverage.py `
        tests/test_export_artifacts_coverage.py `
        tests/test_export_compare_coverage.py `
        tests/test_export_tools_coverage.py `
        tests/test_image_tools.py `
        tests/test_export_custom.py `
        tests/test_export_artifacts.py `
        tests/test_export_compare.py `
        tests/test_export_workbook.py `
        tests/test_export_sitemap.py `
        tests/test_mcp_registry.py `
        tests/test_mcp_resources.py `
        tests/test_tools_branch_coverage.py `
        --cov=website_profiling.tools `
        --cov-config=.coveragerc.tools `
        --cov-report=term-missing `
        --cov-fail-under=100 `
        -q `
        -o addopts=
    Assert-LastExitCode "Tools coverage gate failed"
}

function Invoke-PythonChecks {
    Invoke-Db
    Invoke-Venv
    Invoke-Migrate
    Invoke-PytestCore
    Invoke-PytestReporting
    Invoke-PytestTools
    Write-Log "CLI smoke (python -m src --help)"
    & $VENV_PYTHON -m src --help *> $null
    Assert-LastExitCode "CLI smoke failed"
    Write-Ok "Python checks passed"
}

function Invoke-WebChecks {
    Invoke-WebDeps
    Write-Log "Web typecheck"
    Push-Location $WEB
    try {
        & npm run typecheck
        Assert-LastExitCode "Web typecheck failed"
        Write-Log "Web lint"
        & npm run lint
        Assert-LastExitCode "Web lint failed"
        Write-Log "Web tests (vitest)"
        & npm test
        Assert-LastExitCode "Web tests failed"
    } finally {
        Pop-Location
    }
    Write-Ok "Web checks passed"
}

function Invoke-Quick {
    if (-not $env:DATABASE_URL) {
        Write-Die "DATABASE_URL is not set. Export it or run .\scripts\local-test.ps1 all"
    }
    Invoke-Venv
    Invoke-WebDeps
    Write-Warn "quick: assuming Postgres is up and migrated (.\local-run.ps1 db; .\local-run.ps1 migrate)"
    $PytestNoCov = $true
    Invoke-PytestCore
    Write-Log "CLI smoke (python -m src --help)"
    & $VENV_PYTHON -m src --help *> $null
    Assert-LastExitCode "CLI smoke failed"
    Invoke-WebChecks
    Write-Ok "Quick test run passed"
}

function Show-Help {
    Write-Host @"
Local test runner — mirrors CI (python + web jobs)

  .\scripts\local-test.ps1              Same as: all
  .\scripts\local-test.ps1 all          Postgres + migrations + full pytest + web
  .\scripts\local-test.ps1 python       DB + pytest (core + reporting + tools) + CLI
  .\scripts\local-test.ps1 reporting    Reporting module 100% coverage gate only
  .\scripts\local-test.ps1 tools        Tools module coverage gate only
  .\scripts\local-test.ps1 web          typecheck, lint, vitest (no Docker)
  .\scripts\local-test.ps1 quick        pytest -NoCov + web (DB must be ready)

  .\scripts\local-test.ps1 all -NoCov   skip pytest coverage gates (faster)

Environment (same as .\local-run.ps1):
  DATABASE_URL, DATA_DIR, WP_PG_CONTAINER, WP_PG_PORT, ...

One-time dev setup: .\local-run.ps1 setup
"@
}

$cmd = "all"
$argList = @($args)
if ($argList.Count -gt 0) {
    $cmd = $argList[0]
    $argList = if ($argList.Count -gt 1) { $argList[1..($argList.Count - 1)] } else { @() }
}

foreach ($arg in $argList) {
    switch ($arg) {
        "-NoCov" { $PytestNoCov = $true }
        "-h" { Show-Help; exit 0 }
        "--help" { Show-Help; exit 0 }
        default { Write-Die "Unknown argument: $arg (try: .\scripts\local-test.ps1 help)" }
    }
}

switch ($cmd) {
    "all" {
        Invoke-PythonChecks
        Invoke-WebChecks
        Write-Ok "All local tests passed (CI python + web jobs)"
    }
    "python" { Invoke-PythonChecks }
    "reporting" {
        Invoke-Venv
        Invoke-PytestReporting
        Write-Ok "Reporting coverage gate passed"
    }
    "tools" {
        Invoke-Venv
        Invoke-PytestTools
        Write-Ok "Tools coverage gate passed"
    }
    "web" { Invoke-WebChecks }
    "quick" {
        $PytestNoCov = $true
        Invoke-Quick
    }
    "help" { Show-Help }
    "-h" { Show-Help }
    "--help" { Show-Help }
    default { Write-Die "Unknown command: $cmd (try: .\scripts\local-test.ps1 help)" }
}
