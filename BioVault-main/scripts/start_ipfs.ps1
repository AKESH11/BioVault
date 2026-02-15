<#
.SYNOPSIS
    Start the Kubo IPFS daemon for BioVault.

.DESCRIPTION
    Starts the IPFS daemon with the server profile. The daemon provides:
      - API at http://127.0.0.1:5001  (used by backend)
      - Gateway at http://127.0.0.1:8080  (for content retrieval)

.NOTES
    Prerequisites:
      - Kubo installed (run: scripts/setup_ipfs.ps1 if not)
      - IPFS repo initialized (auto-initializes on first run)
    
    Usage:
      .\scripts\start_ipfs.ps1
      .\scripts\start_ipfs.ps1 -Daemon   # run in background
#>

param(
    [switch]$Daemon
)

$ErrorActionPreference = "Stop"

# Find IPFS binary
$IpfsBin = "$env:LOCALAPPDATA\Kubo\ipfs.exe"
if (-not (Test-Path $IpfsBin)) {
    $IpfsBin = (Get-Command ipfs -ErrorAction SilentlyContinue).Source
}
if (-not $IpfsBin -or -not (Test-Path $IpfsBin)) {
    Write-Error "Kubo (IPFS) not found. Install it first:
  1. Download from https://dist.ipfs.tech/kubo/
  2. Or run: choco install ipfs"
    exit 1
}

# Set repo path
if (-not $env:IPFS_PATH) {
    $env:IPFS_PATH = "$env:USERPROFILE\.ipfs"
}

# Auto-initialize if needed
if (-not (Test-Path "$env:IPFS_PATH\config")) {
    Write-Host "Initializing IPFS repository..."
    & $IpfsBin init --profile=server
    
    # Configure for BioVault
    & $IpfsBin config Addresses.API /ip4/127.0.0.1/tcp/5001
    & $IpfsBin config Addresses.Gateway /ip4/127.0.0.1/tcp/8080
    & $IpfsBin config --json API.HTTPHeaders.Access-Control-Allow-Origin '["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:8081"]'
    & $IpfsBin config --json API.HTTPHeaders.Access-Control-Allow-Methods '["PUT", "POST", "GET"]'
    & $IpfsBin config --json Swarm.ConnMgr.LowWater 50
    & $IpfsBin config --json Swarm.ConnMgr.HighWater 200
    & $IpfsBin config --json Datastore.StorageMax '"10GB"'
    Write-Host "IPFS repo initialized and configured."
}

# Display info
$version = & $IpfsBin --version
$peerId = & $IpfsBin config Identity.PeerID
Write-Host ""
Write-Host "=============================================="
Write-Host "  BioVault IPFS Node"
Write-Host "=============================================="
Write-Host "  Version:  $version"
Write-Host "  Peer ID:  $peerId"
Write-Host "  API:      http://127.0.0.1:5001"
Write-Host "  Gateway:  http://127.0.0.1:8080"
Write-Host "  Repo:     $env:IPFS_PATH"
Write-Host "=============================================="
Write-Host ""

if ($Daemon) {
    Write-Host "Starting IPFS daemon in background..."
    $proc = Start-Process -FilePath $IpfsBin -ArgumentList "daemon", "--enable-gc" `
        -WindowStyle Hidden -PassThru
    Write-Host "IPFS daemon PID: $($proc.Id)"
    Write-Host "Stop with: Stop-Process -Id $($proc.Id)"
} else {
    Write-Host "Starting IPFS daemon (Ctrl+C to stop)..."
    & $IpfsBin daemon --enable-gc
}
