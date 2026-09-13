# Local prod: same Postgres as .\local-run.ps1, full stack + Vite build + preview (NODE_ENV=production).
# Usage: .\local-prod.ps1 [command]
#   (default) start   — DB, migrations, .NET stack, FastAPI, vite preview
#   build             — npm run build only
#   help              — show commands

$ErrorActionPreference = "Stop"

$ROOT = Split-Path -Parent $PSScriptRoot
Set-Location $ROOT

$PG_CONTAINER = if ($env:WP_PG_CONTAINER) { $env:WP_PG_CONTAINER } else { "wp-pg" }
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
$WEB = Join-Path $ROOT "web"
$LOCAL_RUN = Join-Path $PSScriptRoot "local-run.ps1"

$env:WEBSITE_PROFILING_ROOT = $ROOT
if ($env:PYTHONPATH) {
    $env:PYTHONPATH = "$($env:PYTHONPATH);$(Join-Path $ROOT 'src')"
} else {
    $env:PYTHONPATH = Join-Path $ROOT "src"
}
$env:NODE_ENV = "production"
if (-not $env:VITE_BFF_BASE_URL) {
    $env:VITE_BFF_BASE_URL = "http://localhost:8090"
}
$env:DEPRECATE_PYTHON_INTEGRATIONS = "1"
$env:USE_FASTAPI_PYTHON_BRIDGE = "1"

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
                    cmd /c "taskkill /PID $pidToKill /T /F >nul 2>&1"
                }
            }
        }
    }
}

function Wait-ForHttp([string]$Url, [string]$Name, [int]$TimeoutSeconds = 90) {
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
    Write-Log "Shutting down local prod stack..."
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

function Stop-Postgres {
    if (Get-Command docker -ErrorAction SilentlyContinue) {
        $running = & docker ps --format "{{.Names}}" 2>$null
        if ($running -contains $PG_CONTAINER) {
            Write-Log "Stopping $PG_CONTAINER"
            & docker stop $PG_CONTAINER *> $null
            Write-Log "Postgres stopped."
        }
    }
}

function Invoke-Build {
    Ensure-SystemTools
    Ensure-WebDeps
    Write-Log "Building Vite SPA (production, VITE_BFF_BASE_URL=$($env:VITE_BFF_BASE_URL))"
    Push-Location $WEB
    try {
        & npm run build
    } finally {
        Pop-Location
    }
}

function Invoke-Start {
    param([switch]$SkipBuild)

    Ensure-SystemTools
    Ensure-AllProjectDeps

    New-Item -ItemType Directory -Force -Path $env:DATA_DIR | Out-Null
    Write-Log "Ensuring Postgres and migrations (via .\local-run.ps1 migrate)"
    & $LOCAL_RUN migrate

    if (-not $SkipBuild) {
        Invoke-Build
    } else {
        Ensure-WebDeps
        Write-Log "Skipping build (--SkipBuild)"
    }

    $coreUrl = if ($env:CORE_SERVICE_URL) { $env:CORE_SERVICE_URL } else { "http://127.0.0.1:8094" }
    $aiUrl = if ($env:AI_SERVICE_URL) { $env:AI_SERVICE_URL } else { "http://127.0.0.1:8092" }
    $fastApiUrl = if ($env:FASTAPI_URL) { $env:FASTAPI_URL } else { "http://127.0.0.1:8096" }

    try {
        Stop-PortListener 8094
        Write-Log "Starting CoreService on port 8094 (Production)"
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
                "ASPNETCORE_ENVIRONMENT" = "Production"
            } | Out-Null

        Stop-PortListener 8092
        Write-Log "Starting AiService on port 8092 (Production)"
        Start-ManagedProcess -Name "AiService" `
            -FilePath "dotnet" `
            -ArgumentList @("run", "--project", "src/AiService.Api", "--no-launch-profile") `
            -WorkingDirectory (Join-Path $ROOT "services/AiService") `
            -EnvironmentVariables @{
                "DATABASE_URL" = $env:DATABASE_URL
                "FASTAPI_URL" = $fastApiUrl
                "ASPNETCORE_URLS" = "http://127.0.0.1:8092"
                "ASPNETCORE_ENVIRONMENT" = "Production"
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
        Write-Log "Starting BFF on port 8090 (Production)"
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
                "ASPNETCORE_ENVIRONMENT" = "Production"
            } | Out-Null

        Wait-ForHttp "http://127.0.0.1:8090/health" "BFF"

        Write-Log "Starting Vite preview on port 3000 (Ctrl+C stops all services including Postgres)"
        Write-Log "Open http://localhost:3000/home in your browser"

        Push-Location $WEB
        try {
            & npm run preview -- --host 0.0.0.0 --port 3000
        } finally {
            Pop-Location
        }
    } finally {
        Stop-AllManagedProcesses
        Stop-Postgres
        Write-Log "All services stopped."
    }
}

function Show-Help {
    Write-Host @"
Local prod runner — same Postgres as .\local-run.ps1, production Vite build + full .NET stack.

  .\local-prod.ps1              Same as: start
  .\local-prod.ps1 start        DB + migrations + build + full stack + vite preview
  .\local-prod.ps1 start --skip-build   Start without rebuilding (reuse dist/)
  .\local-prod.ps1 build        npm run build only
  .\local-prod.ps1 help         Show this help

After start, open: http://localhost:3000/home
"@
}

$cmd = if ($args.Count -gt 0) { $args[0] } else { "start" }
$skipBuild = ($args -contains "--skip-build")

switch ($cmd) {
    "start" { Invoke-Start -SkipBuild:$skipBuild }
    "build" { Invoke-Build }
    "help" { Show-Help }
    "-h" { Show-Help }
    "--help" { Show-Help }
    default { Write-Die "Unknown command: $cmd (try: .\local-prod.ps1 help)" }
}
