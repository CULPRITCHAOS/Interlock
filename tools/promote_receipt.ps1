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
        $IndexPath = Join-Path $repoRoot "receipts/RECEIPTS_INDEX.md"
    }
    else {
        $IndexPath = Join-Path $repoRoot "receipts/RECEIPTS_INDEX_EXPERIMENTAL.md"
    }
}

# 3.1 Initialize Index from Template if missing
if (-not (Test-Path $IndexPath)) {
    $templatePath = "$IndexPath.template"
    if (Test-Path $templatePath) {
        Write-Host "Initializing index from template: $templatePath" -ForegroundColor Gray
        Copy-Item -Path $templatePath -Destination $IndexPath -Force
    }
}

# 4. Promotion Function
function Start-Promotion {
    param ([string]$ReceiptPath)

    if (-not (Test-Path $ReceiptPath)) {
        Write-Error "Receipt file not found: $ReceiptPath"
        return
    }

    # FIX: If receipt is from examples/, stage a copy to inbox first to protect tracked files
    $normalizedPath = $ReceiptPath -replace '\\', '/'
    if ($normalizedPath -match 'receipts/examples/') {
        $filename = Split-Path $ReceiptPath -Leaf
        $stagedPath = Join-Path $inboxDir $filename
        Write-Host "  [Guard] Example file detected - staging copy to inbox: $stagedPath" -ForegroundColor Gray
        Copy-Item -Path $ReceiptPath -Destination $stagedPath -Force
        $ReceiptPath = $stagedPath
    }

    Write-Host "`n>>> Promoting receipt ($($Mode) mode): $(Split-Path $ReceiptPath -Leaf)" -ForegroundColor Cyan

    # Determine Python command
    $pythonCmd = "py"
    try { & py --version | Out-Null } catch { $pythonCmd = "python" }

    # Run Verifier
    $verifyScript = Join-Path $repoRoot "tools/verify_operatorpack.py"
    $verifyOutput = & $pythonCmd $verifyScript "$ReceiptPath" --mode $Mode | Out-String

    # Write verdict JSON next to receipt
    $verdictPath = "$ReceiptPath.verdict.json"
    $verifyOutput | Out-File -FilePath $verdictPath -Encoding utf8

    # Parse Verdict
    $res = $verifyOutput | ConvertFrom-Json
    $verdict = $res.verdict

    # Workflow Decision
    $shouldApprove = ($verdict -eq "PASS") -or ($verdict -eq "WARN" -and $AllowWarn)
    $destDir = if ($shouldApprove) { $approvedDir } else { $rejectedDir }

    # Move files
    $filename = Split-Path $ReceiptPath -Leaf
    $finalReceiptPath = Join-Path $destDir $filename
    $finalVerdictPath = Join-Path $destDir "$filename.verdict.json"

    Move-Item -Path $ReceiptPath -Destination $finalReceiptPath -Force
    Move-Item -Path $verdictPath -Destination $finalVerdictPath -Force

    # Update Index Table
    if ($shouldApprove) {
        $appendScript = Join-Path $repoRoot "tools/append_receipt_index.py"
        & $pythonCmd $appendScript "$finalReceiptPath" "$IndexPath" | Out-Null
    }

    # Summary Print
    Write-Host "Promotion Result:" -ForegroundColor White -Style Bold
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
        foreach ($r in $res.reasons) { Write-Host "    - $r" -ForegroundColor Gray }
    }
}

# 5. Main Loop
if ($Receipt) {
    Start-Promotion -ReceiptPath $Receipt
}
else {
    $files = Get-ChildItem -Path $inboxDir -Filter "*.json" | Sort-Object LastWriteTime
    if ($files.Count -eq 0) {
        Write-Host "No JSON files found in $inboxDir" -ForegroundColor Yellow
        exit 0
    }
    foreach ($file in $files) {
        Start-Promotion -ReceiptPath $file.FullName
    }
}

Write-Host "`nWorkflow complete." -ForegroundColor Gray
Write-Host "NOTE: receipts/* outputs are local artifacts and are gitignored in this public repo. Do not commit approved/rejected receipts." -ForegroundColor Yellow
