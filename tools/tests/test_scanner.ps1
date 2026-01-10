# Scanner Self-Test
# ==================
# This script tests that precommit_safety_scan.ps1 works correctly.
# Run with: powershell -NoProfile -ExecutionPolicy Bypass -File tools/tests/test_scanner.ps1

param(
    [switch]$Verbose
)

$repoRoot = git rev-parse --show-toplevel
Set-Location $repoRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Scanner Self-Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$testsPassed = 0
$testsFailed = 0

# --- Test 1: Scanner passes on clean HEAD ---
Write-Host "`n[Test 1] Scanner should PASS on clean HEAD..." -NoNewline

$result = & powershell -NoProfile -ExecutionPolicy Bypass -File tools/precommit_safety_scan.ps1 2>&1
$exitCode = $LASTEXITCODE

if ($exitCode -eq 0) {
    Write-Host " PASS" -ForegroundColor Green
    $testsPassed++
}
else {
    Write-Host " FAIL (exit code: $exitCode)" -ForegroundColor Red
    if ($Verbose) { $result | ForEach-Object { Write-Host "  $_" } }
    $testsFailed++
}

# --- Test 2: Scanner detects staged fake secret ---
Write-Host "[Test 2] Scanner should FAIL on staged fake secret..." -NoNewline

# Create a temp file with a fake secret
$tempFile = "test_secret_temp_$(Get-Random).txt"
"OPENAI_API_KEY=sk-fake1234567890abcdefghij" | Out-File -FilePath $tempFile -Encoding utf8

# Stage the file
git add -f $tempFile 2>$null

# Run scanner
$result = & powershell -NoProfile -ExecutionPolicy Bypass -File tools/precommit_safety_scan.ps1 2>&1
$exitCode = $LASTEXITCODE

# Cleanup immediately
git reset HEAD $tempFile 2>$null
Remove-Item $tempFile -Force -ErrorAction SilentlyContinue

if ($exitCode -eq 1) {
    Write-Host " PASS (correctly detected)" -ForegroundColor Green
    $testsPassed++
}
else {
    Write-Host " FAIL (should have detected secret, exit code: $exitCode)" -ForegroundColor Red
    $testsFailed++
}

# --- Test 3: git status should be clean after tests ---
Write-Host "[Test 3] Cleanup leaves git status clean..." -NoNewline

$status = git status --porcelain
$hasTestFile = $status | Where-Object { $_ -like "*test_secret_temp*" }

if (-not $hasTestFile) {
    Write-Host " PASS" -ForegroundColor Green
    $testsPassed++
}
else {
    Write-Host " FAIL (test file still exists)" -ForegroundColor Red
    $testsFailed++
}

# --- Summary ---
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " Self-Test Results: $testsPassed passed, $testsFailed failed" -ForegroundColor $(if ($testsFailed -eq 0) { "Green" } else { "Red" })
Write-Host "========================================" -ForegroundColor Cyan

if ($testsFailed -gt 0) {
    exit 1
}
else {
    exit 0
}
