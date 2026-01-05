# Interlock Watchdog
# Monitors log file freshness to detect stalled runs

param(
    [string]$LogPath = "logs/interlock_events.jsonl",
    [int]$MaxAgeSeconds = 60
)

if (-not (Test-Path $LogPath)) {
    Write-Host "❌ ERROR: Log file not found at $LogPath" -ForegroundColor Red
    exit 1
}

$fileInfo = Get-Item $LogPath
$lastWrite = $fileInfo.LastWriteTime
$age = (Get-Date) - $lastWrite

if ($age.TotalSeconds -gt $MaxAgeSeconds) {
    Write-Host "⚠️  WARNING: Log file stale ($([Math]::Round($age.TotalSeconds))s old)" -ForegroundColor Red
    Write-Host "   Last write: $($lastWrite.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor Yellow
    exit 1
}
else {
    Write-Host "✅ Log file fresh ($([Math]::Round($age.TotalSeconds))s ago)" -ForegroundColor Green
    exit 0
}
