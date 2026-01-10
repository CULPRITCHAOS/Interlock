# Interlock Pre-commit Safety Scan
# ==================================
# This script ensures that no PII, secrets, or benchmark artifacts are accidentally
# committed to the public Interlock repository.
# Run this before every push: powershell -File tools/precommit_safety_scan.ps1

$repoRoot = (git rev-parse --show-toplevel)
Set-Location $repoRoot

Write-Host "=======================================" -ForegroundColor Cyan
Write-Host " Interlock Pre-commit Safety Scan" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan

$exitCode = 0

# --- 1. PII Scan (Hardcoded Machine Paths) ---
Write-Host "`n[1/4] Scanning for hardcoded machine paths (PII)..." -NoNewline
# Patterns: C:\Users, /Users/, /home/
$piiPatterns = "C:\\\\Users|/Users/|/home/"
$piiExclusions = ':!docs/AI_COLLAB_SAFETY.md', ':!tools/precommit_safety_scan.ps1'
$piiSearch = git grep -n -E $piiPatterns -- . $piiExclusions 2>$null
if ($piiSearch) {
    Write-Host " FAIL" -ForegroundColor Red
    Write-Host "Found potential PII leakage:" -ForegroundColor Yellow
    $piiSearch | ForEach-Object { Write-Host "  $_" }
    $exitCode = 1
}
else {
    Write-Host " PASS" -ForegroundColor Green
}

# --- 2. Artifact Path Check (Explicit Blocked Directories) ---
Write-Host "[2/4] Checking for accidentally tracked artifacts..." -NoNewline
$blockedPaths = @(
    "receipts/approved/",
    "receipts/approved_experimental/",
    "receipts/rejected/",
    "receipts/quarantine_local/",
    "receipts/summary/",
    "results/",
    "benchmarks/",
    "ci_sim/results/",
    "EvidenceVault/"
)
$allowedPatterns = @("receipts/examples/", ".gitkeep", ".template")

$trackedFiles = git ls-files
$violations = @()

foreach ($file in $trackedFiles) {
    $isBlocked = $false
    foreach ($blocked in $blockedPaths) {
        if ($file -like "$blocked*") {
            $isBlocked = $true
            break
        }
    }
    if ($isBlocked) {
        $isAllowed = $false
        foreach ($allowed in $allowedPatterns) {
            if ($file -like "*$allowed*") {
                $isAllowed = $true
                break
            }
        }
        if (-not $isAllowed) {
            $violations += $file
        }
    }
}

if ($violations.Count -gt 0) {
    Write-Host " FAIL" -ForegroundColor Red
    Write-Host "Found tracked artifacts that should be ignored:" -ForegroundColor Yellow
    $violations | ForEach-Object { Write-Host "  $_" }
    $exitCode = 1
}
else {
    Write-Host " PASS" -ForegroundColor Green
}

# --- 3. Secret Scan (API Keys / Tokens) ---
Write-Host "[3/4] Scanning for exposed secrets..." -NoNewline
$secretPatterns = "ghp_|github_pat_|GITHUB_TOKEN=|OPENAI_API_KEY|ANTHROPIC_API_KEY|HF_TOKEN|AKIA[A-Z0-9]{16}|AIza[A-Za-z0-9_-]{35}"

# Scan both tracked and staged files
$allFiles = @()
$allFiles += git ls-files
$stagedFiles = git diff --cached --name-only
if ($stagedFiles) { $allFiles += $stagedFiles }
$allFiles = $allFiles | Sort-Object -Unique

$secretViolations = @()
foreach ($file in $allFiles) {
    if (Test-Path $file) {
        # Skip known false-positive files
        if ($file -like "*precommit_safety_scan.ps1" -or $file -like "*AI_COLLAB_SAFETY.md") { continue }
        $content = Get-Content $file -Raw -ErrorAction SilentlyContinue
        if ($content -match $secretPatterns) {
            $secretViolations += $file
        }
    }
}

if ($secretViolations.Count -gt 0) {
    Write-Host " FAIL" -ForegroundColor Red
    Write-Host "Found potential secret exposure:" -ForegroundColor Yellow
    $secretViolations | ForEach-Object { Write-Host "  $_" }
    $exitCode = 1
}
else {
    Write-Host " PASS" -ForegroundColor Green
}

# --- 4. Gitignore Verification ---
Write-Host "[4/4] Verifying gitignore coverage..." -NoNewline
$gitignore = Get-Content .gitignore -ErrorAction SilentlyContinue
$requiredPatterns = @("results/**", "receipts/**/*.json", "logs", ".env")
$missing = @()

foreach ($pattern in $requiredPatterns) {
    $escaped = [regex]::Escape($pattern)
    if (-not ($gitignore -match $escaped)) {
        $missing += $pattern
    }
}

if ($missing.Count -gt 0) {
    Write-Host " WARN" -ForegroundColor Yellow
    Write-Host "  Missing recommended patterns in .gitignore: $($missing -join ', ')"
}
else {
    Write-Host " PASS" -ForegroundColor Green
}

# --- Summary ---
Write-Host "`n=======================================" -ForegroundColor Cyan
if ($exitCode -eq 0) {
    Write-Host " Safety Scan Complete: PASS" -ForegroundColor Green
    Write-Host " Repository appears clean." -ForegroundColor Cyan
}
else {
    Write-Host " Safety Scan Complete: FAIL" -ForegroundColor Red
    Write-Host " DO NOT PUSH. Fix issues above first." -ForegroundColor Yellow
}
Write-Host "=======================================" -ForegroundColor Cyan

exit $exitCode
