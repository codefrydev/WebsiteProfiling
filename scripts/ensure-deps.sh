#!/usr/bin/env bash
# Shared dependency ensure helpers for local-run, local-test, and local-prod.
# Source from other scripts; do not execute directly.
#
# Optional env:
#   WP_SKIP_SYSTEM_INSTALL=1  — fail fast when system tools are missing
#   WP_SKIP_DEPS_SYNC=1       — skip pip/npm/dotnet restore sync

if [[ -z "${ROOT:-}" ]]; then
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

if ! declare -f log >/dev/null 2>&1; then
  log() { printf '\033[1;36m→\033[0m %s\n' "$*"; }
fi
if ! declare -f warn >/dev/null 2>&1; then
  warn() { printf '\033[1;33m!\033[0m %s\n' "$*" >&2; }
fi
if ! declare -f die >/dev/null 2>&1; then
  die() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }
fi
if ! declare -f need_cmd >/dev/null 2>&1; then
  need_cmd() {
    command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
  }
fi

_ensure_deps_venv() {
  echo "${VENV:-${ROOT}/.venv}"
}

_ensure_deps_web() {
  echo "${WEB:-${ROOT}/web}"
}

_python3_version_ok() {
  local py="$1"
  "$py" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)' 2>/dev/null
}

_find_python3() {
  local candidate
  for candidate in python3 python3.12 python; do
    if command -v "$candidate" >/dev/null 2>&1 && _python3_version_ok "$(command -v "$candidate")"; then
      command -v "$candidate"
      return 0
    fi
  done
  if command -v brew >/dev/null 2>&1; then
    local brew_py
    brew_py="$(brew --prefix python@3.12 2>/dev/null)/bin/python3"
    if [[ -x "$brew_py" ]] && _python3_version_ok "$brew_py"; then
      echo "$brew_py"
      return 0
    fi
  fi
  return 1
}

_dotnet_version_ok() {
  local version major
  version="$(dotnet --version 2>/dev/null || true)"
  [[ -z "$version" ]] && return 1
  major="${version%%.*}"
  [[ "$major" =~ ^[0-9]+$ ]] && (( major >= 10 ))
}

_brew_path_prefix() {
  local formula="$1"
  local prefix
  prefix="$(brew --prefix "$formula" 2>/dev/null || true)"
  [[ -n "$prefix" && -d "$prefix/bin" ]] && echo "$prefix/bin"
}

_brew_install() {
  local target="$1"
  local is_cask="${2:-0}"
  need_cmd brew
  log "Installing $target via Homebrew"
  if [[ "$is_cask" == "1" ]]; then
    brew install --cask "$target"
  else
    brew install "$target"
  fi
}

_ensure_brew_on_path() {
  local bin_dir="$1"
  [[ -n "$bin_dir" && -d "$bin_dir" ]] || return 0
  case ":$PATH:" in
    *":$bin_dir:"*) ;;
    *) export PATH="$bin_dir:$PATH" ;;
  esac
}

_ensure_system_tool_macos() {
  local cmd="$1"
  local formula="$2"
  local is_cask="${3:-0}"

  if command -v "$cmd" >/dev/null 2>&1; then
    return 0
  fi
  if [[ "${WP_SKIP_SYSTEM_INSTALL:-}" == "1" ]]; then
    die "Missing required command: $cmd (WP_SKIP_SYSTEM_INSTALL=1)"
  fi
  if ! command -v brew >/dev/null 2>&1; then
    die "Missing required command: $cmd. Install Homebrew from https://brew.sh then retry."
  fi
  _brew_install "$formula" "$is_cask"
  if [[ "$is_cask" != "1" ]]; then
    _ensure_brew_on_path "$(_brew_path_prefix "$formula")"
  fi
  command -v "$cmd" >/dev/null 2>&1 || die "Still missing $cmd after Homebrew install ($formula)"
}

_ensure_system_tool_linux_apt() {
  local cmd="$1"
  shift
  local packages=("$@")

  if command -v "$cmd" >/dev/null 2>&1; then
    return 0
  fi
  if [[ "${WP_SKIP_SYSTEM_INSTALL:-}" == "1" ]]; then
    die "Missing required command: $cmd (WP_SKIP_SYSTEM_INSTALL=1)"
  fi
  if ! command -v apt-get >/dev/null 2>&1; then
    die "Missing required command: $cmd. Install manually (see README.md prerequisites)."
  fi
  log "Installing ${packages[*]} via apt-get"
  if command -v sudo >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y "${packages[@]}"
  else
    apt-get update
    apt-get install -y "${packages[@]}"
  fi
  command -v "$cmd" >/dev/null 2>&1 || die "Still missing $cmd after apt-get install"
}

_ensure_python_system_tool() {
  if _find_python3 >/dev/null; then
    return 0
  fi
  case "$(uname -s)" in
    Darwin)
      _ensure_system_tool_macos python3 python@3.12 0
      _ensure_brew_on_path "$(_brew_path_prefix python@3.12)"
      ;;
    Linux)
      _ensure_system_tool_linux_apt python3 python3 python3-venv python3-pip
      ;;
    *)
      die "Missing Python 3.12+. Install manually (see README.md prerequisites)."
      ;;
  esac
  _find_python3 >/dev/null || die "Python 3.12+ still unavailable after install attempt"
}

_ensure_node_system_tool() {
  if command -v npm >/dev/null 2>&1 && command -v node >/dev/null 2>&1; then
    return 0
  fi
  case "$(uname -s)" in
    Darwin)
      _ensure_system_tool_macos npm node@20 0
      _ensure_brew_on_path "$(_brew_path_prefix node@20)"
      ;;
    Linux)
      _ensure_system_tool_linux_apt npm nodejs npm
      ;;
    *)
      die "Missing Node/npm. Install manually (see README.md prerequisites)."
      ;;
  esac
}

_ensure_dotnet_system_tool() {
  if _dotnet_version_ok; then
    return 0
  fi
  case "$(uname -s)" in
    Darwin)
      if command -v dotnet >/dev/null 2>&1; then
        die ".NET SDK 10+ required (found $(dotnet --version)). Install: brew install dotnet@10"
      fi
      if brew list --formula dotnet@10 >/dev/null 2>&1 || brew info dotnet@10 >/dev/null 2>&1; then
        _ensure_system_tool_macos dotnet dotnet@10 0
        _ensure_brew_on_path "$(_brew_path_prefix dotnet@10)"
      else
        _ensure_system_tool_macos dotnet dotnet 0
      fi
      ;;
    Linux)
      if command -v dotnet >/dev/null 2>&1; then
        die ".NET SDK 10+ required (found $(dotnet --version)). See https://dotnet.microsoft.com/download"
      fi
      if command -v apt-get >/dev/null 2>&1; then
        log "Installing dotnet-sdk-10.0 via apt-get"
        if command -v sudo >/dev/null 2>&1; then
          sudo apt-get update
          sudo apt-get install -y dotnet-sdk-10.0
        else
          apt-get update
          apt-get install -y dotnet-sdk-10.0
        fi
      else
        die "Missing .NET SDK 10+. Install manually (see README.md prerequisites)."
      fi
      ;;
    *)
      die "Missing .NET SDK 10+. Install manually (see README.md prerequisites)."
      ;;
  esac
  _dotnet_version_ok || die ".NET SDK 10+ still unavailable after install attempt"
}

_ensure_docker_system_tool() {
  if command -v docker >/dev/null 2>&1; then
    return 0
  fi
  case "$(uname -s)" in
    Darwin)
      _ensure_system_tool_macos docker docker 1
      ;;
    Linux)
      _ensure_system_tool_linux_apt docker docker.io || \
        _ensure_system_tool_linux_apt docker docker-ce
      ;;
    *)
      die "Missing Docker. Install manually (see README.md prerequisites)."
      ;;
  esac
}

ensure_system_tools() {
  _ensure_python_system_tool
  _ensure_node_system_tool
  _ensure_dotnet_system_tool
  _ensure_docker_system_tool
}

ensure_python_deps() {
  if [[ "${WP_SKIP_DEPS_SYNC:-}" == "1" ]]; then
    return 0
  fi

  local venv python3_bin
  venv="$(_ensure_deps_venv)"
  python3_bin="$(_find_python3)" || die "Python 3.12+ required (see README.md prerequisites)"

  if [[ ! -x "$venv/bin/python" ]]; then
    log "Creating Python venv at .venv"
    "$python3_bin" -m venv "$venv"
  fi
  log "Installing Python dependencies"
  "$venv/bin/pip" install -q -r "$ROOT/requirements.txt"
  export PYTHON="${PYTHON:-$venv/bin/python}"
}

ensure_web_deps() {
  if [[ "${WP_SKIP_DEPS_SYNC:-}" == "1" ]]; then
    return 0
  fi

  local web lock stamp
  web="$(_ensure_deps_web)"
  lock="$web/package-lock.json"
  stamp="$web/.deps-installed"

  need_cmd npm
  if [[ ! -d "$web/node_modules" ]] || [[ ! -f "$stamp" ]] || [[ "$lock" -nt "$stamp" ]]; then
    log "Installing/updating web dependencies (npm ci)"
    (cd "$web" && npm ci)
    touch "$stamp"
  fi
}

ensure_dotnet_deps() {
  if [[ "${WP_SKIP_DEPS_SYNC:-}" == "1" ]]; then
    return 0
  fi
  if ! command -v dotnet >/dev/null 2>&1; then
    return 0
  fi
  log "Restoring .NET packages"
  (cd "$ROOT/services" && dotnet restore WebsiteProfiling.slnx)
}

ensure_browser_deps() {
  if [[ "${WP_SKIP_DEPS_SYNC:-}" == "1" ]]; then
    return 0
  fi

  local venv
  venv="$(_ensure_deps_venv)"
  ensure_python_deps
  log "Ensuring Playwright + Chromium for JS crawl"
  if ! "$venv/bin/python" -c "
from website_profiling.crawl.fetchers import ensure_browser_deps
import json, sys
status = ensure_browser_deps()
print(json.dumps(status))
sys.exit(0 if status.get('ok') else 1)
"; then
    warn "Browser deps unavailable — JS/auto crawl disabled until Playwright + Chromium install successfully"
  fi
}

ensure_all_project_deps() {
  ensure_python_deps
  ensure_dotnet_deps
  ensure_browser_deps
  ensure_web_deps
}
