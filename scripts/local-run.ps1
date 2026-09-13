# Local dev: PostgreSQL in Docker (wp-pg), Python venv + Vite/React SPA + .NET backend on host.
# Usage: .\local-run.ps1 [command]
#   (default) start   — ensure DB, migrations, full .NET stack, FastAPI bridge, npm run dev
#   setup           — DB + venv + deps + migrations (no dev server)
#   db              — start Postgres container only
#   migrate         — EF Core: dotnet run --project services\Schema\src\Schema.Migrator
#   stop            — stop wp-pg container
#   docker          — run entire full stack in Docker (docker compose up --build)
#   docker:prod     — run production stack in Docker (docker compose -f docker-compose.prod.yml up --build)
#   docker:down     — stop all Docker compose services
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
$WEB = Join-Path $ROOT "web"
$SCHEMA_MIGRATOR = Join-Path $ROOT "services\Schema\src\Schema.Migrator"

$env:WEBSITE_PROFILING_ROOT = $ROOT
if ($env:PYTHONPATH) {
    $env:PYTHONPATH = "$($env:PYTHONPATH);$(Join-Path $ROOT 'src')"
} else {
    $env:PYTHONPATH = Join-Path $ROOT "src"
}
if (-not $env:PYTHON) {
    $env:PYTHON = $VENV_PYTHON
}

. (Join-Path $PSScriptRoot "ensure-deps.ps1")

$global:ManagedProcesses = [System.Collections.Generic.List[System.Diagnostics.Process]]::new()

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

function Stop-PortListener([int]$Port) {
    try {
        $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        if ($connections) {
            foreach ($conn in $connections) {
                $pId = $conn.OwningProcess
                if ($pId -and $pId -gt 0 -and $pId -ne $PID) {
                    Write-Warn "Stopping stale listener on port $Port (PID: $pId)"
                    cmd /c "taskkill /PID $pId /T /F >nul 2>&1"
                }
            }
            Start-Sleep -Milliseconds 300
        }
    } catch {
        $lines = netstat -ano | Select-String ":$Port\s+.*LISTENING\s+(\d+)"
        foreach ($line in $lines) {
            if ($line.Matches[0].Groups[1].Value -match '^\d+$') {
                $pidToKill = [int]$line.Matches[0].Groups[1].Value
                if ($pidToKill -gt 0 -and $pidToKill -ne $PID) {
                    Write-Warn "Stopping stale listener on port $Port (PID: $pidToKill)"
                    cmd /c "taskkill /PID $pidToKill /T /F >nul 2>&1"
                }
            }
        }
    }
}

function Wait-ForHttp([string]$Url, [string]$Name, [int]$TimeoutSeconds = 60) {
    Write-Log "Waiting for $Name ($Url)"
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    while ($stopwatch.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        try {
            $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 400) {
                Write-Host "-> $Name ready" -ForegroundColor Green
                return $true
            }
        } catch {
            Start-Sleep -Seconds 1
        }
    }
    Write-Die "$Name did not become ready in ${TimeoutSeconds}s ($Url)"
}

function Start-ManagedProcess {
    param(
        [string]$Name,
        [string]$FilePath,
        [string[]]$ArgumentList,
        [string]$WorkingDirectory,
        [hashtable]$EnvironmentVariables = @{}
    )

    $psi = [System.Diagnostics.ProcessStartInfo]::new()
    $psi.FileName = $FilePath
    foreach ($arg in $ArgumentList) {
        $psi.ArgumentList.Add($arg)
    }
    $psi.WorkingDirectory = $WorkingDirectory
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true

    foreach ($key in $EnvironmentVariables.Keys) {
        $psi.EnvironmentVariables[$key] = [string]$EnvironmentVariables[$key]
    }

    $proc = [System.Diagnostics.Process]::Start($psi)
    if ($proc) {
        $global:ManagedProcesses.Add($proc)
    }
    return $proc
}

function Stop-AllManagedProcesses {
    Write-Log "Shutting down local background services..."
    foreach ($proc in $global:ManagedProcesses) {
        if ($proc -and -not $proc.HasExited) {
            try {
                cmd /c "taskkill /PID $($proc.Id) /T /F >nul 2>&1"
            } catch {
                try { $proc.Kill() } catch {}
            }
        }
    }
    $global:ManagedProcesses.Clear()
}

function Get-DockerContainerNames {
    param([switch]$All)

    $dockerArgs = if ($All) { @("ps", "-a", "--format", "{{.Names}}") } else { @("ps", "--format", "{{.Names}}") }
    $output = & docker @dockerArgs 2>$null
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

function Invoke-Migrate {
    Ensure-SystemTools
    Ensure-DotnetDeps
    Invoke-Db
    Write-Log "Applying database migrations (EF Core: Schema.Migrator)"
    & dotnet run --project $SCHEMA_MIGRATOR --no-launch-profile
    Assert-LastExitCode "Database migration failed (Schema.Migrator)"
}

function Invoke-Setup {
    New-Item -ItemType Directory -Force -Path $env:DATA_DIR | Out-Null
    Ensure-SystemTools
    Ensure-AllProjectDeps
    Invoke-Migrate
    Write-Log "Setup complete."
    Write-Log "Start the UI: .\local-run.ps1 start"
    Write-Log "Open http://localhost:3000/home (use localhost, not 127.0.0.1 for pipeline APIs)"
}

function Invoke-Start {
    New-Item -ItemType Directory -Force -Path $env:DATA_DIR | Out-Null
    Ensure-SystemTools
    Ensure-AllProjectDeps
    Invoke-Migrate

    $bffBase = if ($env:VITE_BFF_BASE_URL) { $env:VITE_BFF_BASE_URL } else { "http://localhost:8090" }
    $coreUrl = if ($env:CORE_SERVICE_URL) { $env:CORE_SERVICE_URL } else { "http://127.0.0.1:8094" }
    $aiUrl = if ($env:AI_SERVICE_URL) { $env:AI_SERVICE_URL } else { "http://127.0.0.1:8092" }
    $fastApiUrl = if ($env:FASTAPI_URL) { $env:FASTAPI_URL } else { "http://127.0.0.1:8096" }

    try {
        Stop-PortListener 8094
        Write-Log "Starting CoreService on port 8094"
        Start-ManagedProcess -Name "CoreService" `
            -FilePath "dotnet" `
            -ArgumentList @("run", "--project", "src/CoreService.Api", "--no-launch-profile") `
            -WorkingDirectory (Join-Path $ROOT "services/CoreService") `
            -EnvironmentVariables @{
                "DATABASE_URL" = $env:DATABASE_URL
                "FASTAPI_URL" = $fastApiUrl
                "AI_SERVICE_URL" = $aiUrl
                "WEBSITE_PROFILING_ROOT" = $ROOT
                "DATA_DIR" = $env:DATA_DIR
                "PYTHON" = $VENV_PYTHON
                "REPORT_SERVICE_USE_PYTHON_BRIDGE" = "0"
                "REPORT_SERVICE_VALIDATE_NATIVE" = "1"
                "REPORT_SERVICE_WORKER_ENABLED" = "1"
                "USE_FASTAPI_PYTHON_BRIDGE" = "1"
                "ASPNETCORE_URLS" = "http://127.0.0.1:8094"
                "ASPNETCORE_ENVIRONMENT" = "Development"
            } | Out-Null

        Stop-PortListener 8092
        Write-Log "Starting AiService on port 8092"
        Start-ManagedProcess -Name "AiService" `
            -FilePath "dotnet" `
            -ArgumentList @("run", "--project", "src/AiService.Api", "--no-launch-profile") `
            -WorkingDirectory (Join-Path $ROOT "services/AiService") `
            -EnvironmentVariables @{
                "DATABASE_URL" = $env:DATABASE_URL
                "FASTAPI_URL" = $fastApiUrl
                "ASPNETCORE_URLS" = "http://127.0.0.1:8092"
                "ASPNETCORE_ENVIRONMENT" = "Development"
                "WP_MCP_HTTP" = "1"
            } | Out-Null

        Wait-ForHttp "http://127.0.0.1:8094/health" "CoreService"
        Wait-ForHttp "http://127.0.0.1:8092/health" "AiService"

        Stop-PortListener 8096
        Write-Log "Starting Python bridge (FastAPI) on port 8096"
        Start-ManagedProcess -Name "FastAPI" `
            -FilePath $VENV_PYTHON `
            -ArgumentList @("-m", "uvicorn", "website_profiling.api.main:app", "--host", "0.0.0.0", "--port", "8096", "--workers", "1") `
            -WorkingDirectory $ROOT `
            -EnvironmentVariables @{
                "DATABASE_URL" = $env:DATABASE_URL
                "DATA_DIR" = $env:DATA_DIR
                "PYTHON" = $VENV_PYTHON
                "WEBSITE_PROFILING_ROOT" = $ROOT
                "PYTHONPATH" = $env:PYTHONPATH
                "FASTAPI_URL" = $fastApiUrl
                "FASTAPI_ALLOWED_ORIGINS" = "http://localhost:8090"
                "DEPRECATE_PYTHON_INTEGRATIONS" = "1"
                "DEPRECATE_PYTHON_REPORT_ROUTES" = "1"
            } | Out-Null

        Wait-ForHttp "http://127.0.0.1:8096/api/health" "FastAPI"

        Stop-PortListener 8090
        Write-Log "Starting BFF on port 8090"
        Start-ManagedProcess -Name "BFF" `
            -FilePath "dotnet" `
            -ArgumentList @("run", "--project", "src/Bff.Api", "--no-launch-profile") `
            -WorkingDirectory (Join-Path $ROOT "services/Bff") `
            -EnvironmentVariables @{
                "FASTAPI_URL" = $fastApiUrl
                "CORE_SERVICE_URL" = $coreUrl
                "DATA_SERVICE_URL" = $coreUrl
                "AI_SERVICE_URL" = $aiUrl
                "INTEGRATIONS_SERVICE_URL" = $coreUrl
                "REPORT_SERVICE_URL" = $coreUrl
                "REPORT_ROUTES" = "/api/compare,/api/dashboards,/api/run,/api/jobs,/api/schedule,/api/crawl,/api/pipeline-preview"
                "DATA_ROUTES" = "/api/report/meta,/api/report/payload,/api/report/history,/api/report/crawl-payload,/api/report/mobile-delta,/api/report/portfolio,/api/portfolio,/api/issues/status,/api/filters,/api/properties,/api/content-drafts,/api/content/score,/api/keywords,/api/page-markdown,/api/alerts,/api/logs,/api/backlinks,/api/pipeline-settings,/api/ui-preferences,/api/client-preferences"
                "AI_ROUTES" = "/api/chat,/api/links/page-coach,/api/issues/fix-suggestion,/api/issues/action-plan,/api/ai/fix-suggestion,/api/dashboards/ai-generate,/api/content/analyze,/api/content/wizard,/api/llm-settings,/api/secrets,/api/ollama/status,/api/report/audit-tool,/api/mcp-tools"
                "INTEGRATIONS_ROUTES" = "/api/integrations/google,/api/integrations/bing"
                "BFF_ALLOWED_ORIGINS" = "http://localhost:3000"
                "AUTH_SECRET" = ""
                "SESSION_SECRET" = ""
                "AUTH_PASSWORD" = ""
                "AUTH_USER" = ""
                "ASPNETCORE_URLS" = "http://127.0.0.1:8090"
                "ASPNETCORE_ENVIRONMENT" = "Development"
            } | Out-Null

        Wait-ForHttp "http://127.0.0.1:8090/health" "BFF"

        $env:VITE_BFF_BASE_URL = $bffBase

        Write-Log "Starting Vite dev server (Ctrl+C stops all services including Postgres)"
        Write-Log "DATABASE_URL=$($env:DATABASE_URL)"
        Write-Log "DATA_DIR=$($env:DATA_DIR)"
        Write-Log "VITE_BFF_BASE_URL=$bffBase"
        Write-Log "CORE_SERVICE_URL=$coreUrl"
        Write-Log "AI_SERVICE_URL=$aiUrl"
        Write-Log "FASTAPI_URL=$fastApiUrl"
        Write-Log "Open http://localhost:3000/home in your browser"

        Push-Location $WEB
        try {
            & npm run dev
        } finally {
            Pop-Location
        }
    } finally {
        Stop-AllManagedProcesses
        Invoke-Stop
        Write-Log "All services stopped."
    }
}

function Invoke-Stop {
    Test-DockerRunning
    if (Test-ContainerRunning $PG_CONTAINER) {
        Write-Log "Stopping $PG_CONTAINER"
        & docker stop $PG_CONTAINER *> $null
        Assert-LastExitCode "Failed to stop container $PG_CONTAINER"
        Write-Log "Postgres stopped."
    } else {
        Write-Warn "Container $PG_CONTAINER is not running"
    }
}

function Invoke-DockerCompose([string]$Mode = "dev") {
    Test-DockerRunning
    switch ($Mode) {
        "dev" {
            Write-Log "Starting full stack via Docker Compose (docker compose up --build)..."
            & docker compose up --build
        }
        "prod" {
            Write-Log "Starting production layout via Docker Compose..."
            & docker compose -f docker-compose.prod.yml up --build
        }
        "down" {
            Write-Log "Stopping Docker Compose containers..."
            & docker compose down
        }
    }
}

function Show-Help {
    Write-Host @"
Local dev runner - Postgres in Docker, app on your machine

  .\local-run.ps1              Same as: start
  .\local-run.ps1 start        DB + migrations + full stack + npm run dev (Ctrl+C stops all)
  .\local-run.ps1 setup        One-time setup (no dev server)
  .\local-run.ps1 db           Start Postgres only
  .\local-run.ps1 migrate      Apply EF Core migrations (Schema.Migrator)
  .\local-run.ps1 stop         Stop Postgres container

Docker Compose commands:
  .\local-run.ps1 docker       Build & run full stack in Docker (docker compose up --build)
  .\local-run.ps1 docker:prod  Run production stack in Docker (docker compose -f docker-compose.prod.yml)
  .\local-run.ps1 docker:down  Tear down Docker containers (docker compose down)

Environment overrides (optional):
  DATABASE_URL  (default: postgres://postgres:dev@127.0.0.1:5432/website_profiling)
  DATA_DIR      (default: <repo>/data)
  PYTHON        (default: <repo>/.venv/Scripts/python.exe)
  WP_PG_CONTAINER, WP_PG_PORT, WP_PG_PASSWORD, WP_PG_DB
  WP_SKIP_SYSTEM_INSTALL, WP_SKIP_DEPS_SYNC

After start, open: http://localhost:3000/home
Run audits via sidebar "Run audit" (bottom-right FAB).

Run CI-style tests: .\local-test.ps1 or ./local-test (bash/Git Bash/WSL).
"@
}

$cmd = if ($args.Count -gt 0) { $args[0] } else { "start" }

switch ($cmd) {
    "start" { Invoke-Start }
    "setup" { Invoke-Setup }
    "db" { Invoke-Db }
    "migrate" { Invoke-Migrate }
    "stop" { Invoke-Stop }
    "docker" { Invoke-DockerCompose "dev" }
    "docker:prod" { Invoke-DockerCompose "prod" }
    "docker:down" { Invoke-DockerCompose "down" }
    "help" { Show-Help }
    "-h" { Show-Help }
    "--help" { Show-Help }
    default { Write-Die "Unknown command: $cmd (try: .\local-run.ps1 help)" }
}
