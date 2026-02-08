#!/usr/bin/env pwsh
# BioVault Smart Contract Setup & Deployment Script
# Run this from the smart-contracts directory

Write-Host ""
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "🔧 BioVault Smart Contract Setup" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$ErrorActionPreference = "Stop"

# Check if we're in the smart-contracts directory
if (!(Test-Path "hardhat.config.js")) {
    Write-Host "❌ Error: Run this script from the smart-contracts directory" -ForegroundColor Red
    Write-Host ""
    exit 1
}

# Step 1: Check .env file
Write-Host "1️⃣  Checking configuration..." -ForegroundColor Yellow
Write-Host ""

if (!(Test-Path ".env")) {
    Write-Host "⚠️  .env file not found. Creating from example..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host ""
    Write-Host "📝 IMPORTANT: Edit .env file and add your private key!" -ForegroundColor Red
    Write-Host ""
    Write-Host "   1. Open .env file" -ForegroundColor Yellow
    Write-Host "   2. Replace PRIVATE_KEY with your MetaMask private key" -ForegroundColor Yellow
    Write-Host "   3. Save the file" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Press Enter after updating .env file..." -ForegroundColor Cyan
    Read-Host
}

# Check if private key is set
$envContent = Get-Content ".env" -Raw
if ($envContent -match "PRIVATE_KEY=0x0{64}") {
    Write-Host "❌ ERROR: Private key not set in .env file!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Get your MetaMask private key:" -ForegroundColor Yellow
    Write-Host "   1. Open MetaMask extension" -ForegroundColor White
    Write-Host "   2. Click account icon → Account Details" -ForegroundColor White
    Write-Host "   3. Click 'Show Private Key'" -ForegroundColor White
    Write-Host "   4. Enter password and copy key" -ForegroundColor White
    Write-Host "   5. Paste in .env file (PRIVATE_KEY=0x...)" -ForegroundColor White
    Write-Host ""
    exit 1
}

Write-Host "   ✅ Configuration file found" -ForegroundColor Green
Write-Host ""

# Step 2: Install dependencies
Write-Host "2️⃣  Installing dependencies..." -ForegroundColor Yellow
Write-Host ""

npm install

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ npm install failed" -ForegroundColor Red
    exit 1
}

Write-Host "   ✅ Dependencies installed" -ForegroundColor Green
Write-Host ""

# Step 3: Compile contracts
Write-Host "3️⃣  Compiling smart contracts..." -ForegroundColor Yellow
Write-Host ""

npx hardhat compile

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Compilation failed" -ForegroundColor Red
    exit 1
}

Write-Host "   ✅ Contracts compiled successfully" -ForegroundColor Green
Write-Host ""

# Step 4: Check balance
Write-Host "4️⃣  Checking wallet balance..." -ForegroundColor Yellow
Write-Host ""

npx hardhat run scripts/checkBalance.js --network amoy

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "⚠️  Need test POL? Get it from faucets:" -ForegroundColor Yellow
    Write-Host "   https://faucet.polygon.technology/" -ForegroundColor Cyan
    Write-Host "   https://faucet.quicknode.com/polygon/amoy" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Your wallet: 0xa160d83cb71Bb583Ec6e9375a43F520691f3bB12" -ForegroundColor White
    Write-Host ""
    Write-Host "Press Enter after getting test POL to continue..." -ForegroundColor Yellow
    Read-Host
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Green
Write-Host "✅ Setup Complete!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host ""
Write-Host "📦 Deploy contracts:" -ForegroundColor Yellow
Write-Host "   npx hardhat run scripts/deployWithVerifier.js --network amoy" -ForegroundColor White
Write-Host ""
Write-Host "🔍 Verify on PolygonScan:" -ForegroundColor Yellow
Write-Host "   npx hardhat verify --network amoy <CONTRACT_ADDRESS>" -ForegroundColor White
Write-Host ""
Write-Host "🧪 Run tests:" -ForegroundColor Yellow
Write-Host "   npx hardhat test" -ForegroundColor White
Write-Host ""
