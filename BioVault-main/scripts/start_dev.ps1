# ============================================================================
# Start Full Bio-Vault Development Stack (Local Hardhat)
# ============================================================================
# Starts: Hardhat Node → Deploy Contracts → Backend Server
# Usage: .\scripts\start_dev.ps1
#
# Prerequisites:
#   cd smart-contracts && npm install
#   cd backend && npm install

param(
    [switch]$SkipIPFS     # Add -SkipIPFS to skip starting IPFS daemon
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $root) { $root = Split-Path -Parent $PSScriptRoot }

Write-Host ""
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "  Bio-Vault Development Stack" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# ------ 1. Start Hardhat Node ------
Write-Host "[1/4] Starting Hardhat Node..." -ForegroundColor Yellow

$hardhatCli = Join-Path $root "BioVault-main\node_modules\hardhat\internal\cli\cli.js"
if (-not (Test-Path $hardhatCli)) {
    Write-Host "  ERROR: Hardhat not found. Run: cd smart-contracts && npm install" -ForegroundColor Red
    exit 1
}

$hardhatProc = Start-Process node -ArgumentList $hardhatCli, "node" `
    -WorkingDirectory (Join-Path $root "BioVault-main\smart-contracts") `
    -PassThru -WindowStyle Minimized
Write-Host "  Hardhat PID: $($hardhatProc.Id)" -ForegroundColor Green

# Wait for Hardhat to be ready
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    try {
        $null = Invoke-WebRequest -Uri "http://127.0.0.1:8545" -Method POST `
            -Body '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' `
            -ContentType "application/json" -ErrorAction SilentlyContinue
        $ready = $true
        break
    } catch { }
}

if (-not $ready) {
    Write-Host "  ERROR: Hardhat Node did not start in 30s" -ForegroundColor Red
    Stop-Process -Id $hardhatProc.Id -Force
    exit 1
}
Write-Host "  Hardhat Node: http://127.0.0.1:8545 (chainId 31337)" -ForegroundColor Green

# ------ 2. Deploy Contracts ------
Write-Host ""
Write-Host "[2/4] Deploying contracts..." -ForegroundColor Yellow

Push-Location (Join-Path $root "BioVault-main\smart-contracts")
npx hardhat run scripts/deploy.js --network localhost 2>&1 | ForEach-Object { Write-Host "  $_" }
Pop-Location

# ------ 3. Start IPFS (optional) ------
if (-not $SkipIPFS) {
    Write-Host ""
    Write-Host "[3/4] Starting IPFS daemon..." -ForegroundColor Yellow

    $ipfsExe = "$env:LOCALAPPDATA\Kubo\ipfs.exe"
    if (Test-Path $ipfsExe) {
        # Check if already running
        $ipfsRunning = $false
        try {
            $null = Invoke-RestMethod -Uri "http://127.0.0.1:5001/api/v0/id" `
                -Method POST -Headers @{ Origin = "http://localhost:3000" } -ErrorAction SilentlyContinue
            $ipfsRunning = $true
        } catch { }

        if ($ipfsRunning) {
            Write-Host "  IPFS already running" -ForegroundColor Green
        } else {
            $ipfsProc = Start-Process $ipfsExe -ArgumentList "daemon" -PassThru -WindowStyle Minimized
            Write-Host "  IPFS PID: $($ipfsProc.Id)" -ForegroundColor Green
            Start-Sleep -Seconds 5
        }
    } else {
        Write-Host "  IPFS not installed (skipping)" -ForegroundColor DarkYellow
    }
} else {
    Write-Host ""
    Write-Host "[3/4] IPFS skipped (-SkipIPFS)" -ForegroundColor DarkYellow
}

# ------ 4. Start Backend ------
Write-Host ""
Write-Host "[4/4] Starting backend server..." -ForegroundColor Yellow

$backendDir = Join-Path $root "BioVault-main\backend"

# Ensure .env has local Hardhat config
$envFile = Join-Path $backendDir ".env"
$envContent = Get-Content $envFile -Raw
if ($envContent -notmatch "127\.0\.0\.1:8545") {
    Write-Host "  WARNING: .env does not point to localhost. Copy .env.local for Hardhat dev." -ForegroundColor DarkYellow
}

Write-Host ""
Write-Host "====================================" -ForegroundColor Green
Write-Host "  Stack Ready!" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Green
Write-Host "  Backend:  http://localhost:3000" -ForegroundColor White
Write-Host "  Hardhat:  http://127.0.0.1:8545" -ForegroundColor White
Write-Host "  IPFS:     http://127.0.0.1:5001" -ForegroundColor White
Write-Host "  WS:       ws://localhost:3000/ws" -ForegroundColor White
Write-Host ""
Write-Host "  Ctrl+C to stop backend (Hardhat/IPFS run in separate windows)" -ForegroundColor DarkGray
Write-Host ""

# Run backend in foreground
Push-Location $backendDir
node src/index.js
Pop-Location

# Cleanup on exit
Write-Host ""
Write-Host "Stopping Hardhat Node..." -ForegroundColor Yellow
Stop-Process -Id $hardhatProc.Id -Force -ErrorAction SilentlyContinue
Write-Host "Done." -ForegroundColor Green
