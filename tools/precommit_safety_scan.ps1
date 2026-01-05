# Interlock Pre-commit Safety Scan
# ==================================
# This script ensures that no PII or benchmark artifacts are accidentally committed
# to the public Interlock repository.

$repoRoot = (git rev-parse --show-toplevel)
Set-Location $repoRoot

Write-Host "🛡️ Starting Interlock Safety Scan..." -ForegroundColor Cyan

# 1. PII Scan (No C:\Users or /Users/ paths)
Write-Host "[1/3] Scanning for hardcoded machine paths (PII)..." -NoNewline
$piiSearch = git grep -n "C:\\Users|/Users/" -- . ':!docs/AI_COLLAB_SAFETY.md' ':!tools/precommit_safety_scan.ps1' 2>$null
if ($piiSearch) {
    Write-Host " FAIL" -ForegroundColor Red
    Write-Host "Found potential PII leakage:" -ForegroundColor Yellow
    $piiSearch | ForEach-Object { Write-Host "  $_" }
    exit 1
}
else {
    Write-Host " PASS" -ForegroundColor Green
}

# 2. Artifact Check (No receipts or summaries tracked)
Write-Host "[2/3] Checking for accidentally tracked artifacts..." -NoNewline
$trackedArtifacts = git ls-files | Select-String -Pattern "receipts/.*\.json$|results/.*\.md$|results/.*\.json$" | Select-String -Pattern "template" -NotMatch | Select-String -Pattern "example" -NotMatch
if ($trackedArtifacts) {
    Write-Host " FAIL" -ForegroundColor Red
    Write-Host "Found tracked artifacts that should be ignored:" -ForegroundColor Yellow
    $trackedArtifacts | ForEach-Object { Write-Host "  $_" }
    exit 1
}
else {
    Write-Host " PASS" -ForegroundColor Green
}

# 3. Gitignore Verification
Write-Host "[3/3] Verifying gitignore coverage..." -NoNewline
$gitignore = Get-Content .gitignore
$requiredPatterns = @("results/**", "receipts/**/*.json", "logs")
$missing = @()

foreach ($pattern in $requiredPatterns) {
    if (-not ($gitignore -match [regex]::Escape($pattern))) {
        $missing += $pattern
    }
}

if ($missing.Count -gt 0) {
    Write-Host " WARN" -ForegroundColor Yellow
    Write-Host "Missing recommended patterns in .gitignore: $($missing -join ', ')"
}
else {
    Write-Host " PASS" -ForegroundColor Green
}

Write-Host "`n✅ Safety Scan Complete. Repository appears clean." -ForegroundColor Cyan
