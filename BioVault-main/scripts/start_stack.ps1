<#
.SYNOPSIS
    Start the full BioVault backend stack (IPFS + API Server).

.DESCRIPTION
    Launches both the Kubo IPFS daemon and the Express backend server.
    IPFS runs in background; the backend runs in the foreground.

.NOTES
    Usage:
      .\scripts\start_stack.ps1

    Stop:
      Ctrl+C stops the backend; IPFS daemon is killed automatically.
#>

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$BackendDir = Join-Path $ProjectRoot "backend"

# Find IPFS
$IpfsBin = "$env:LOCALAPPDATA\Kubo\ipfs.exe"
if (-not (Test-Path $IpfsBin)) {
    $IpfsBin = (Get-Command ipfs -ErrorAction SilentlyContinue).Source
}

Write-Host ""
Write-Host "=============================================="
Write-Host "  BioVault Stack Launcher"
Write-Host "=============================================="
Write-Host ""

# ── 1. Start IPFS Daemon ──────────────────────────────────────────────────
$ipfsProc = $null
if ($IpfsBin -and (Test-Path $IpfsBin)) {
    if (-not $env:IPFS_PATH) { $env:IPFS_PATH = "$env:USERPROFILE\.ipfs" }

    # Auto-init if needed
    if (-not (Test-Path "$env:IPFS_PATH\config")) {
        Write-Host "[IPFS] Initializing repository..."
        & $IpfsBin init --profile=server | Out-Null
        & $IpfsBin config Addresses.API /ip4/127.0.0.1/tcp/5001
        & $IpfsBin config Addresses.Gateway /ip4/127.0.0.1/tcp/8080
        & $IpfsBin config --json API.HTTPHeaders.Access-Control-Allow-Origin '["http://localhost:3000", "http://127.0.0.1:3000"]'
        & $IpfsBin config --json API.HTTPHeaders.Access-Control-Allow-Methods '["PUT", "POST", "GET"]'
    }

    # Check if daemon already running
    try {
        $null = Invoke-RestMethod -Uri "http://127.0.0.1:5001/api/v0/version" -Method Post -TimeoutSec 2
        Write-Host "[IPFS] Daemon already running" -ForegroundColor Yellow
    } catch {
        Write-Host "[IPFS] Starting daemon..."
        $ipfsProc = Start-Process -FilePath $IpfsBin -ArgumentList "daemon", "--enable-gc" `
            -WindowStyle Hidden -PassThru
        Write-Host "[IPFS] Daemon PID: $($ipfsProc.Id)"

        # Wait for API to be ready
        $ready = $false
        for ($i = 0; $i -lt 15; $i++) {
            Start-Sleep -Seconds 1
            try {
                $ver = Invoke-RestMethod -Uri "http://127.0.0.1:5001/api/v0/version" -Method Post -TimeoutSec 2
                Write-Host "[IPFS] Ready — Kubo $($ver.Version)" -ForegroundColor Green
                $ready = $true
                break
            } catch {}
        }
        if (-not $ready) {
            Write-Host "[IPFS] Warning: daemon didn't respond within 15s" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "[IPFS] Not installed — skipping (backend will use fallback mode)" -ForegroundColor Yellow
}

# ── 2. Start Backend Server ───────────────────────────────────────────────
Write-Host ""
Write-Host "[API]  Starting backend server..."

try {
    Push-Location $BackendDir
    & npm start
} finally {
    Pop-Location

    # Cleanup: kill IPFS daemon if we started it
    if ($ipfsProc -and -not $ipfsProc.HasExited) {
        Write-Host ""
        Write-Host "[IPFS] Stopping daemon (PID $($ipfsProc.Id))..."
        Stop-Process -Id $ipfsProc.Id -Force -ErrorAction SilentlyContinue
        Write-Host "[IPFS] Stopped."
    }
}
