# Telemetry Analysis Script
# Analyzes the interlock_events.jsonl from the autonomous run

param(
    [string]$LogPath = "logs/interlock_events.jsonl",
    [string]$OutputPath = ""
)

if (-not (Test-Path $LogPath)) {
    Write-Host "Error: Log file not found at $LogPath" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== Analyzing Telemetry from $LogPath ===`n" -ForegroundColor Cyan

# Get basic stats
$fileInfo = Get-Item $LogPath
$fileSizeMB = [Math]::Round($fileInfo.Length / 1MB, 2)
Write-Host "File Size: $fileSizeMB MB"

# Count total lines (events)
$totalLines = 0
Get-Content $LogPath -ReadCount 1000 | ForEach-Object { $totalLines += $_.Count }
Write-Host "Total Events: $($totalLines.ToString('N0'))"

# Get first and last events for time range
$firstEvent = Get-Content $LogPath -First 1 | ConvertFrom-Json
$lastEvent = Get-Content $LogPath -Tail 1 | ConvertFrom-Json

# Time analysis
$startTime = [DateTime]::Parse($firstEvent.timestamp)
$endTime = [DateTime]::Parse($lastEvent.timestamp)
$duration = $endTime - $startTime
$durationHours = [Math]::Round($duration.TotalHours, 2)

Write-Host "`nTime Range:"
Write-Host "   Start:    $($startTime.ToLocalTime().ToString('yyyy-MM-dd HH:mm:ss'))"
Write-Host "   End:      $($endTime.ToLocalTime().ToString('yyyy-MM-dd HH:mm:ss'))"
Write-Host "   Duration: $durationHours hours"

# Sample analysis for performance
Write-Host "`nSampling events for analysis..." -ForegroundColor Yellow
$sampleSize = [Math]::Min(2000, $totalLines)
$sampleInterval = [Math]::Max(1, [Math]::Floor($totalLines / $sampleSize))

$sample = @()
$counter = 0
Get-Content $LogPath | ForEach-Object {
    if ($counter % $sampleInterval -eq 0) {
        $sample += ($_ | ConvertFrom-Json)
    }
    $counter++
    if ($sample.Count -ge $sampleSize) { return }
}

$healthWindows = $sample | Where-Object { $_.event_type -eq 'health_window' }
$interventions = $sample | Where-Object { $_.event_type -eq 'intervention' }

Write-Host "   Sample size: $($sample.Count)"
Write-Host "   - Health Windows: $($healthWindows.Count)"
Write-Host "   - Interventions: $($interventions.Count)"

if ($healthWindows.Count -gt 0) {
    # Latency stats
    $latencies = $healthWindows | ForEach-Object { $_.metrics.latency_p95_ms }
    $avgLatency = ($latencies | Measure-Object -Average).Average
    $maxLatency = ($latencies | Measure-Object -Maximum).Maximum
    $minLatency = ($latencies | Measure-Object -Minimum).Minimum

    Write-Host "`nLatency P95 (Sample):"
    Write-Host "   Average: $([Math]::Round($avgLatency, 1))ms"
    Write-Host "   Min:     $([Math]::Round($minLatency, 1))ms"
    Write-Host "   Max:     $([Math]::Round($maxLatency, 1))ms"

    # Threshold breaches
    $breaches = $healthWindows | Where-Object { $_.metrics.latency_p95_ms -gt $_.thresholds.latency_threshold_ms }
    $breachRate = 0
    if ($healthWindows.Count -gt 0) {
        $breachRate = ($breaches.Count / $healthWindows.Count) * 100
    }

    Write-Host "`nLatency Threshold Breaches:"
    Write-Host "   Count: $($breaches.Count) / $($healthWindows.Count)"
    Write-Host "   Rate:  $([Math]::Round($breachRate, 1))%"

    # Request volume
    $totalRequests = ($healthWindows | ForEach-Object { $_.metrics.request_count } | Measure-Object -Sum).Sum
    $avgRequests = 0
    if ($healthWindows.Count -gt 0) {
        $avgRequests = $totalRequests / $healthWindows.Count
    }

    Write-Host "`nRequest Volume (Sample):"
    Write-Host "   Total: $totalRequests"
    Write-Host "   Avg per window: $([Math]::Round($avgRequests, 1))"
    Write-Host "   Est. QPS: $([Math]::Round($avgRequests / 5, 1))"

    # Threshold evolution
    $thresholds = $healthWindows | ForEach-Object { $_.thresholds.latency_threshold_ms } | Select-Object -Unique | Sort-Object
    if ($thresholds.Count -gt 1) {
        Write-Host "`nThreshold Changes Detected:"
        foreach ($threshold in $thresholds) {
            $count = ($healthWindows | Where-Object { $_.thresholds.latency_threshold_ms -eq $threshold }).Count
            Write-Host "   ${threshold}ms: $count windows"
        }
    }

    # Output JSON if requested
    if ($OutputPath) {
        $summary = @{
            analyzed_at     = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
            log_path        = $LogPath
            file_size_mb    = $fileSizeMB
            duration_hours  = $durationHours
            total_events    = $totalLines
            health_windows  = $healthWindows.Count
            interventions   = $interventions.Count
            latency_p95_avg = [Math]::Round($avgLatency, 1)
            latency_p95_max = [Math]::Round($maxLatency, 1)
            breach_count    = $breaches.Count
            breach_rate     = [Math]::Round($breachRate, 1)
        }
        New-Item -ItemType Directory -Force -Path (Split-Path $OutputPath) -ErrorAction SilentlyContinue | Out-Null
        $summary | ConvertTo-Json | Out-File $OutputPath -Encoding UTF8
        Write-Host "`nSummary saved to: $OutputPath" -ForegroundColor Green
    }
}

if ($interventions.Count -gt 0) {
    Write-Host "`nInterventions (Sample: $($interventions.Count)):"
    $triggerCounts = $interventions | Group-Object -Property trigger | Sort-Object Count -Descending
    Write-Host "   Triggers:"
    foreach ($group in $triggerCounts | Select-Object -First 5) {
        Write-Host "      - $($group.Name): $($group.Count)"
    }
}

Write-Host ""
