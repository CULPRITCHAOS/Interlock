param (
    [string]$Receipt,
    $AllowWarn = $true,
    [string]$IndexPath,
    [string]$Mode = "production"
)

# Convert AllowWarn to boolean robustly
if ($AllowWarn -is [string]) {
    if ($AllowWarn -eq "false" -or $AllowWarn -eq "0" -or $AllowWarn -eq "$false") {
        $AllowWarn = $false
    }
    else {
        $AllowWarn = $true
    }
}
else {
    $AllowWarn = [bool]$AllowWarn
}


# 1. Determine repo root
try {
    $repoRoot = git rev-parse --show-toplevel
}
catch {
    Write-Error "Failed to determine repo root. Ensure you are in a git repository."
    exit 1
}

$repoRoot = $repoRoot.Trim()
Set-Location $repoRoot

# 2. Folder structure based on mode
$suffix = if ($Mode -eq "exploration") { "_experimental" } else { "" }

$inboxDir = Join-Path $repoRoot "receipts/inbox"
$approvedDir = Join-Path $repoRoot "receipts/approved$($suffix)"
$rejectedDir = Join-Path $repoRoot "receipts/rejected$($suffix)"

foreach ($dir in @($inboxDir, $approvedDir, $rejectedDir)) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}

# 3. Default Pathing
if (-not $IndexPath) {
    if ($Mode -eq "production") {
        $robIndexPath = Join-Path $HOME "Desktop\cross project files\RECEIPTS_INDEX.md"
        if (Test-Path $robIndexPath) { $IndexPath = $robIndexPath }
        else { $IndexPath = Join-Path $repoRoot "receipts/RECEIPTS_INDEX.md" }
    }
    else {
        $IndexPath = Join-Path $repoRoot "receipts/RECEIPTS_INDEX_EXPERIMENTAL.md"
    }
}

# 4. Auto-pick newest if no receipt provided
if (-not $Receipt) {
    $newest = Get-ChildItem -Path $inboxDir -Filter "*.json" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $newest) {
        Write-Host "No receipt provided and no JSON files found in $inboxDir" -ForegroundColor Yellow
        exit 0
    }
    $Receipt = $newest.FullName
}

if (-not (Test-Path $Receipt)) {
    Write-Error "Receipt file not found: $Receipt"
    exit 1
}

Write-Host "Promoting receipt ($(Mode) mode): $(Split-Path $Receipt -Leaf)" -ForegroundColor Cyan

# 5. Determine Python command
$pythonCmd = "py"
try {
    & py --version | Out-Null
}
catch {
    $pythonCmd = "python"
}

# 6. Run Verifier
$verifyScript = Join-Path $repoRoot "tools/verify_operatorpack.py"
$verifyOutput = & $pythonCmd $verifyScript "$Receipt" --mode $Mode | Out-String

# Write verdict JSON next to receipt
$verdictPath = "$Receipt.verdict.json"
$verifyOutput | Out-File -FilePath $verdictPath -Encoding utf8

# Parse Verdict
$res = $verifyOutput | ConvertFrom-Json
$verdict = $res.verdict

# 7. Workflow Decision
$shouldApprove = ($verdict -eq "PASS") -or ($verdict -eq "WARN" -and $AllowWarn)
$destDir = if ($shouldApprove) { $approvedDir } else { $rejectedDir }

# Move files
$filename = Split-Path $Receipt -Leaf
$finalReceiptPath = Join-Path $destDir $filename
$finalVerdictPath = Join-Path $destDir "$filename.verdict.json"

Move-Item -Path $Receipt -Destination $finalReceiptPath -Force
Move-Item -Path $verdictPath -Destination $finalVerdictPath -Force

# 8. Update Index Table
if ($shouldApprove) {
    $appendScript = Join-Path $repoRoot "tools/append_receipt_index.py"
    & $pythonCmd $appendScript "$finalReceiptPath" "$IndexPath" | Out-Null
}

# 9. Summary Print
Write-Host "`nPromotion Result:" -ForegroundColor White -Style Bold
Write-Host "  Verdict:       " -NoNewline
if ($verdict -eq "PASS") { Write-Host $verdict -ForegroundColor Green }
elseif ($verdict -eq "WARN") { Write-Host $verdict -ForegroundColor Yellow }
else { Write-Host $verdict -ForegroundColor Red }

Write-Host "  Mode:          $Mode"
Write-Host "  Max N:         $($res.max_N)"
Write-Host "  Build Time:    $($res.build_time_s_at_maxN)s"
Write-Host "  Memory:        $($res.mem_mb_at_maxN) MB"
Write-Host "  Reciprocity:   $($res.reciprocity)"
Write-Host "  Destination:   $destDir"

if ($res.reasons.Count -gt 0) {
    Write-Host "  Reasons:" -ForegroundColor Gray
    foreach ($r in $res.reasons) {
        Write-Host "    - $r" -ForegroundColor Gray
    }
}

Write-Host "`nWorkflow complete." -ForegroundColor Green
