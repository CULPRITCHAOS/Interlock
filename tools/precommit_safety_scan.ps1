# Interlock Pre-commit Safety Scan
# ==================================
# This script ensures that no PII, secrets, or benchmark artifacts are accidentally
# committed to the public Interlock repository.
# Run this before every push: powershell -NoProfile -File tools/precommit_safety_scan.ps1

# Ensure we're at repo root
$repoRoot = (git rev-parse --show-toplevel 2>$null)
if (-not $repoRoot) {
    Write-Host "ERROR: Not in a git repository" -ForegroundColor Red
    exit 1
}
Set-Location $repoRoot

Write-Host "=======================================" -ForegroundColor Cyan
Write-Host " Interlock Pre-commit Safety Scan" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan

# Track overall result
$scanPassed = $true

# --- 1. PII Scan (Hardcoded Machine Paths) ---
Write-Host "`n[1/4] Scanning for hardcoded machine paths (PII)..." -NoNewline

# Use git grep with explicit exclusions for files that legitimately contain these patterns
$piiMatches = @()
$trackedFiles = git ls-files
foreach ($file in $trackedFiles) {
    # Skip known files that legitimately contain path patterns (documentation/scanner/config)
    if ($file -eq "tools/precommit_safety_scan.ps1") { continue }
    if ($file -eq "docs/AI_COLLAB_SAFETY.md") { continue }
    if ($file -like "*.md" -and $file -like "*SAFETY*") { continue }
    if ($file -like ".claude/*") { continue }
    if ($file -like ".agent/*") { continue }
    
    if (Test-Path $file) {
        $content = Get-Content $file -Raw -ErrorAction SilentlyContinue
        if ($content) {
            # Check for Windows paths like C:\Users
            if ($content -match 'C:\\Users\\') { $piiMatches += $file }
            # Check for macOS paths
            elseif ($content -match '/Users/[a-zA-Z]') { $piiMatches += $file }
            # Check for Linux home paths
            elseif ($content -match '/home/[a-zA-Z]') { $piiMatches += $file }
        }
    }
}

if ($piiMatches.Count -gt 0) {
    Write-Host " FAIL" -ForegroundColor Red
    Write-Host "Found potential PII leakage:" -ForegroundColor Yellow
    $piiMatches | ForEach-Object { Write-Host "  $_" }
    $scanPassed = $false
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

$artifactViolations = @()
foreach ($file in $trackedFiles) {
    $isBlocked = $false
    foreach ($blocked in $blockedPaths) {
        if ($file.StartsWith($blocked)) {
            $isBlocked = $true
            break
        }
    }
    if ($isBlocked) {
        $isAllowed = $false
        foreach ($allowed in $allowedPatterns) {
            if ($file.Contains($allowed)) {
                $isAllowed = $true
                break
            }
        }
        if (-not $isAllowed) {
            $artifactViolations += $file
        }
    }
}

if ($artifactViolations.Count -gt 0) {
    Write-Host " FAIL" -ForegroundColor Red
    Write-Host "Found tracked artifacts that should be ignored:" -ForegroundColor Yellow
    $artifactViolations | ForEach-Object { Write-Host "  $_" }
    $scanPassed = $false
}
else {
    Write-Host " PASS" -ForegroundColor Green
}

# --- 3. Secret Scan (API Keys / Tokens) ---
Write-Host "[3/4] Scanning for exposed secrets..." -NoNewline

# Files to always skip (contain patterns as documentation/detection rules)
$skipFiles = @(
    "tools/precommit_safety_scan.ps1",
    "tools/scanner_diagnostic.ps1",
    "docs/AI_COLLAB_SAFETY.md"
)

# Combine tracked and staged files
$allFiles = @()
$allFiles += $trackedFiles
$stagedFiles = git diff --cached --name-only 2>$null
if ($stagedFiles) { $allFiles += $stagedFiles }
$allFiles = $allFiles | Sort-Object -Unique

$secretViolations = @()
foreach ($file in $allFiles) {
    # Skip known false-positive files
    if ($skipFiles -contains $file) { continue }
    
    if (Test-Path $file) {
        $content = Get-Content $file -Raw -ErrorAction SilentlyContinue
        if ($content) {
            # Check for various secret patterns
            $hasSecret = $false
            if ($content -match 'ghp_[a-zA-Z0-9]{36}') { $hasSecret = $true }
            elseif ($content -match 'github_pat_[a-zA-Z0-9_]{22,}') { $hasSecret = $true }
            elseif ($content -match 'GITHUB_TOKEN\s*=\s*[''"]?[a-zA-Z0-9_]+') { $hasSecret = $true }
            elseif ($content -match 'OPENAI_API_KEY\s*=\s*[''"]?sk-') { $hasSecret = $true }
            elseif ($content -match 'ANTHROPIC_API_KEY\s*=') { $hasSecret = $true }
            elseif ($content -match 'HF_TOKEN\s*=') { $hasSecret = $true }
            elseif ($content -match 'AKIA[A-Z0-9]{16}') { $hasSecret = $true }
            elseif ($content -match 'AIza[A-Za-z0-9_-]{35}') { $hasSecret = $true }
            
            if ($hasSecret) {
                $secretViolations += $file
            }
        }
    }
}

if ($secretViolations.Count -gt 0) {
    Write-Host " FAIL" -ForegroundColor Red
    Write-Host "Found potential secret exposure:" -ForegroundColor Yellow
    $secretViolations | ForEach-Object { Write-Host "  $_" }
    $scanPassed = $false
}
else {
    Write-Host " PASS" -ForegroundColor Green
}

# --- 4. Gitignore Verification ---
Write-Host "[4/4] Verifying gitignore coverage..." -NoNewline

$gitignore = Get-Content .gitignore -ErrorAction SilentlyContinue
$requiredPatterns = @("results/**", "receipts/**/*.json", "logs", ".env")
$missingPatterns = @()

foreach ($pattern in $requiredPatterns) {
    $escaped = [regex]::Escape($pattern)
    $found = $false
    foreach ($line in $gitignore) {
        if ($line -match $escaped) {
            $found = $true
            break
        }
    }
    if (-not $found) {
        $missingPatterns += $pattern
    }
}

if ($missingPatterns.Count -gt 0) {
    Write-Host " WARN" -ForegroundColor Yellow
    Write-Host "  Missing recommended patterns in .gitignore: $($missingPatterns -join ', ')"
    # Note: This is a warning, not a failure
}
else {
    Write-Host " PASS" -ForegroundColor Green
}

# --- Summary ---
Write-Host "`n=======================================" -ForegroundColor Cyan
if ($scanPassed) {
    Write-Host " Safety Scan Complete: PASS" -ForegroundColor Green
    Write-Host " Repository appears clean." -ForegroundColor Cyan
    Write-Host "=======================================" -ForegroundColor Cyan
    exit 0
}
else {
    Write-Host " Safety Scan Complete: FAIL" -ForegroundColor Red
    Write-Host " DO NOT PUSH. Fix issues above first." -ForegroundColor Yellow
    Write-Host "=======================================" -ForegroundColor Cyan
    exit 1
}
