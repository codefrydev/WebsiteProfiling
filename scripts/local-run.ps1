# Local dev: PostgreSQL in Docker (wp-pg), Python venv + Next.js on the host.
# Usage: .\local-run.ps1 [command]
#   (default) start   — ensure DB, migrations, npm run dev
#   setup           — DB + venv + deps + migrations (no web server)
#   db              — start Postgres container only
#   migrate         — alembic upgrade head
#   stop            — stop wp-pg container
#   help            — show commands
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
$VENV_ALEMBIC = Join-Path $VENV "Scripts\alembic.exe"
$WEB = Join-Path $ROOT "web"

$env:WEBSITE_PROFILING_ROOT = $ROOT
if ($env:PYTHONPATH) {
    $env:PYTHONPATH = "$($env:PYTHONPATH);$(Join-Path $ROOT 'src')"
} else {
    $env:PYTHONPATH = Join-Path $ROOT "src"
}
if (-not $env:PYTHON) {
    $env:PYTHON = $VENV_PYTHON
}

function Write-Log([string]$Message) {
    Write-Host "-> $Message" -ForegroundColor Cyan
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
    foreach ($cmd in @("py", "python", "python3")) {
        if (Get-Command $cmd -ErrorAction SilentlyContinue) {
            if ($cmd -eq "py") {
                return @("py", "-3")
            }
            return @($cmd)
        }
    }
    Write-Die "Missing required command: python (install Python 3.11+ and ensure it is on PATH)"
}

function Get-DockerContainerNames {
    param([switch]$All)

    $dockerArgs = if ($All) { @("ps", "-a") } else { @("ps") }
    $output = & docker @dockerArgs --format "{{.Names}}" 2>$null
    if (-not $output) {
        return @()
    }
    # Force array: a single container name returns a scalar string; -contains on a
    # string checks characters, not whole names.
    return @($output | ForEach-Object { "$_".Trim() } | Where-Object { $_ })
}

function Test-DockerRunning {
    Test-Command docker
    & docker info *> $null
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
        & @pyLauncher -m venv $VENV
        Assert-LastExitCode "Failed to create Python virtual environment at .venv"
    }
    Write-Log "Installing Python dependencies"
    & $VENV_PIP install -q -r (Join-Path $ROOT "requirements.txt")
    Assert-LastExitCode "Failed to install requirements.txt"
    & $VENV_PIP install -q -r (Join-Path $ROOT "requirements-browser.txt")
    Assert-LastExitCode "Failed to install requirements-browser.txt"
    & $VENV_PIP install -q -r (Join-Path $ROOT "requirements-llm.txt")
    Assert-LastExitCode "Failed to install requirements-llm.txt"
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

function Invoke-BrowserDeps {
    if (-not (Test-Path $VENV_PYTHON)) {
        Invoke-Venv
    }
    Write-Log "Ensuring Playwright + Chromium for JS crawl"
    $script = @"
from website_profiling.crawl.fetchers import ensure_browser_deps
import json, sys
status = ensure_browser_deps()
print(json.dumps(status))
sys.exit(0 if status.get('ok') else 1)
"@
    & $VENV_PYTHON -c $script
    if ($PSVersionTable.PSVersion.Major -ge 7) {
        $failed = ($LASTEXITCODE -ne 0)
    } else {
        $failed = (-not $?)
    }
    if ($failed) {
        Write-Warn "Browser deps unavailable - JS/auto crawl disabled until Playwright + Chromium install successfully"
    }
}

function Invoke-Setup {
    New-Item -ItemType Directory -Force -Path $env:DATA_DIR | Out-Null
    Invoke-Db
    Invoke-Venv
    Invoke-BrowserDeps
    Invoke-Migrate
    Invoke-WebDeps
    Write-Log "Setup complete."
    Write-Log "Start the UI: .\local-run.ps1 start"
    Write-Log "Open http://localhost:3000/home (use localhost, not 127.0.0.1 for pipeline APIs)"
}

function Invoke-Start {
    New-Item -ItemType Directory -Force -Path $env:DATA_DIR | Out-Null
    Invoke-Db
    if (-not (Test-Path $VENV_ALEMBIC)) {
        Invoke-Venv
    }
    Invoke-BrowserDeps
    Write-Log "Ensuring migrations are up to date"
    & $VENV_ALEMBIC upgrade head
    Assert-LastExitCode "Database migration failed (alembic upgrade head)"
    Invoke-WebDeps
    Write-Log "Starting Next.js dev server (Ctrl+C to stop)"
    Write-Log "DATABASE_URL=$($env:DATABASE_URL)"
    Write-Log "DATA_DIR=$($env:DATA_DIR)"
    Write-Log "PYTHON=$($env:PYTHON)"
    Push-Location $WEB
    try {
        & npm run dev
    } finally {
        Pop-Location
    }
}

function Invoke-Stop {
    Test-DockerRunning
    if (Test-ContainerRunning $PG_CONTAINER) {
        Write-Log "Stopping $PG_CONTAINER"
        & docker stop $PG_CONTAINER *> $null
        Assert-LastExitCode "Failed to stop container $PG_CONTAINER"
    } else {
        Write-Warn "Container $PG_CONTAINER is not running"
    }
}

function Show-Help {
    Write-Host @"
Local dev runner - Postgres in Docker, app on your machine

  .\local-run.ps1              Same as: start
  .\local-run.ps1 start        DB + migrations + npm run dev
  .\local-run.ps1 setup        One-time setup (no dev server)
  .\local-run.ps1 db           Start Postgres only
  .\local-run.ps1 migrate      Run alembic upgrade head
  .\local-run.ps1 stop         Stop Postgres container

Environment overrides (optional):
  DATABASE_URL  (default: postgres://postgres:dev@127.0.0.1:5432/website_profiling)
  DATA_DIR      (default: <repo>/data)
  PYTHON        (default: <repo>/.venv/Scripts/python.exe)
  WP_PG_CONTAINER, WP_PG_PORT, WP_PG_PASSWORD, WP_PG_DB

After start, open: http://localhost:3000/home
Run audits via sidebar "Run audit" (bottom-right FAB).

Run CI-style tests: ./local-test (bash/Git Bash/WSL) or see scripts/local-test.sh.
"@
}

$cmd = if ($args.Count -gt 0) { $args[0] } else { "start" }

switch ($cmd) {
    "start" { Invoke-Start }
    "setup" { Invoke-Setup }
    "db" { Invoke-Db }
    "migrate" { Invoke-Migrate }
    "stop" { Invoke-Stop }
    "help" { Show-Help }
    "-h" { Show-Help }
    "--help" { Show-Help }
    default { Write-Die "Unknown command: $cmd (try: .\local-run.ps1 help)" }
}
