# Shared dependency ensure helpers for local-run.ps1 and local-test.ps1.
# Dot-source after $ROOT, $VENV, $WEB are set.

if (-not $ROOT) {
    $ROOT = Split-Path -Parent $PSScriptRoot
}

function Write-EnsureLog([string]$Message) {
    if (Get-Command Write-Log -ErrorAction SilentlyContinue) {
        Write-Log $Message
    } else {
        Write-Host "-> $Message" -ForegroundColor Cyan
    }
}

function Write-EnsureWarn([string]$Message) {
    if (Get-Command Write-Warn -ErrorAction SilentlyContinue) {
        Write-Warn $Message
    } else {
        Write-Host "! $Message" -ForegroundColor Yellow
    }
}

function Write-EnsureDie([string]$Message) {
    if (Get-Command Write-Die -ErrorAction SilentlyContinue) {
        Write-Die $Message
    } else {
        Write-Host "X $Message" -ForegroundColor Red
        exit 1
    }
}

function Assert-EnsureExitCode([string]$Message) {
    if (Get-Command Assert-LastExitCode -ErrorAction SilentlyContinue) {
        Assert-LastExitCode $Message
        return
    }
    $failed = $false
    if ($PSVersionTable.PSVersion.Major -ge 7) {
        $failed = ($LASTEXITCODE -ne 0)
    } else {
        $failed = (-not $?)
    }
    if ($failed) {
        Write-EnsureDie $Message
    }
}

function Test-PythonVersionOk {
    param([string]$PythonPath)

    if (-not $PythonPath) { return $false }
    & $PythonPath -c "import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)" 2>$null
    if ($PSVersionTable.PSVersion.Major -ge 7) {
        return ($LASTEXITCODE -eq 0)
    }
    return $?
}

function Get-EnsurePythonLauncher {
    foreach ($cmd in @("python", "python3", "py")) {
        if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { continue }
        if ($cmd -eq "py") {
            $candidate = @("py", "-3")
            & py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)" 2>$null
        } else {
            $candidate = @($cmd)
            & $cmd -c "import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)" 2>$null
        }
        $ok = if ($PSVersionTable.PSVersion.Major -ge 7) { $LASTEXITCODE -eq 0 } else { $? }
        if ($ok) { return ,$candidate }
    }
    return $null
}

function Invoke-EnsurePythonLauncher {
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
    Assert-EnsureExitCode "Python command failed: $($Launcher -join ' ') $($PythonArgs -join ' ')"
}

function Test-DotnetVersionOk {
    if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) { return $false }
    $version = (& dotnet --version 2>$null)
    if (-not $version) { return $false }
    $major = [int]($version.Split('.')[0])
    return ($major -ge 10)
}

function Install-WingetPackage {
    param(
        [string]$CommandName,
        [string]$PackageId
    )

    if (Get-Command $CommandName -ErrorAction SilentlyContinue) {
        return
    }
    if ($env:WP_SKIP_SYSTEM_INSTALL -eq "1") {
        Write-EnsureDie "Missing required command: $CommandName (WP_SKIP_SYSTEM_INSTALL=1)"
    }
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-EnsureDie "Missing required command: $CommandName. Install winget package $PackageId manually."
    }
    Write-EnsureLog "Installing $PackageId via winget"
    & winget install --id $PackageId -e --accept-source-agreements --accept-package-agreements
    Assert-EnsureExitCode "winget install failed for $PackageId"
    if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
        Write-EnsureWarn "$CommandName not on PATH yet — open a new terminal after winget install"
        Write-EnsureDie "Still missing required command: $CommandName"
    }
}

function Ensure-SystemTools {
    Install-WingetPackage -CommandName "docker" -PackageId "Docker.DockerDesktop"
    Install-WingetPackage -CommandName "python" -PackageId "Python.Python.3.12"
    if (-not (Get-EnsurePythonLauncher)) {
        Install-WingetPackage -CommandName "python3" -PackageId "Python.Python.3.12"
    }
    Install-WingetPackage -CommandName "npm" -PackageId "OpenJS.NodeJS.LTS"
    if (-not (Test-DotnetVersionOk)) {
        Install-WingetPackage -CommandName "dotnet" -PackageId "Microsoft.DotNet.SDK.10"
    }
    if (-not (Test-DotnetVersionOk)) {
        Write-EnsureDie ".NET SDK 10+ required (see README.md prerequisites)"
    }
}

function Ensure-PythonDeps {
    if ($env:WP_SKIP_DEPS_SYNC -eq "1") { return }

    $venv = if ($VENV) { $VENV } else { Join-Path $ROOT ".venv" }
    $venvPython = Join-Path $venv "Scripts\python.exe"
    $venvPip = Join-Path $venv "Scripts\pip.exe"

    $pyLauncher = Get-EnsurePythonLauncher
    if (-not $pyLauncher) {
        Write-EnsureDie "Python 3.12+ required (see README.md prerequisites)"
    }

    if (-not (Test-Path $venvPython)) {
        Write-EnsureLog "Creating Python venv at .venv"
        Invoke-EnsurePythonLauncher -Launcher $pyLauncher -PythonArgs @("-m", "venv", $venv)
    }
    Write-EnsureLog "Installing Python dependencies"
    & $venvPip install -q -r (Join-Path $ROOT "requirements.txt")
    Assert-EnsureExitCode "Failed to install requirements.txt"
    $env:PYTHON = $venvPython
}

function Ensure-WebDeps {
    if ($env:WP_SKIP_DEPS_SYNC -eq "1") { return }

    $web = if ($WEB) { $WEB } else { Join-Path $ROOT "web" }
    $lock = Join-Path $web "package-lock.json"
    $stamp = Join-Path $web ".deps-installed"
    $nodeModules = Join-Path $web "node_modules"

    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Write-EnsureDie "Missing required command: npm"
    }

    $needsInstall = -not (Test-Path $nodeModules) -or -not (Test-Path $stamp)
    if (-not $needsInstall -and (Test-Path $lock) -and (Test-Path $stamp)) {
        $needsInstall = (Get-Item $lock).LastWriteTimeUtc -gt (Get-Item $stamp).LastWriteTimeUtc
    }
    if ($needsInstall) {
        Write-EnsureLog "Installing/updating web dependencies (npm ci)"
        Push-Location $web
        try {
            & npm ci
            Assert-EnsureExitCode "Failed to install web dependencies (npm ci)"
            Set-Content -Path $stamp -Value ((Get-Date).ToUniversalTime().ToString("o"))
        } finally {
            Pop-Location
        }
    }
}

function Ensure-DotnetDeps {
    if ($env:WP_SKIP_DEPS_SYNC -eq "1") { return }
    if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) { return }

    Write-EnsureLog "Restoring .NET packages"
    Push-Location (Join-Path $ROOT "services")
    try {
        & dotnet restore WebsiteProfiling.slnx
        Assert-EnsureExitCode "dotnet restore failed"
    } finally {
        Pop-Location
    }
}

function Ensure-BrowserDeps {
    if ($env:WP_SKIP_DEPS_SYNC -eq "1") { return }

    $venv = if ($VENV) { $VENV } else { Join-Path $ROOT ".venv" }
    $venvPython = Join-Path $venv "Scripts\python.exe"

    Ensure-PythonDeps
    Write-EnsureLog "Ensuring Playwright + Chromium for JS crawl"
    $script = @"
from website_profiling.crawl.fetchers import ensure_browser_deps
import json, sys
status = ensure_browser_deps()
print(json.dumps(status))
sys.exit(0 if status.get('ok') else 1)
"@
    & $venvPython -c $script
    $failed = if ($PSVersionTable.PSVersion.Major -ge 7) { $LASTEXITCODE -ne 0 } else { -not $? }
    if ($failed) {
        Write-EnsureWarn "Browser deps unavailable - JS/auto crawl disabled until Playwright + Chromium install successfully"
    }
}

function Ensure-AllProjectDeps {
    Ensure-PythonDeps
    Ensure-DotnetDeps
    Ensure-BrowserDeps
    Ensure-WebDeps
}
