# A/B Test Runner
# Compares baseline law vs burst protection law with identical traffic conditions

param(
    [int]$DurationMinutes = 120, # 2 hours per test
    [string]$InterlockPath = "C:\Users\13cul\Desktop\Interlock"
)

$tests = @(
    @{ Name = "baseline"; Law = "laws/baselines/ollama.json" },
    @{ Name = "burst"; Law = "laws/proposed/ollama_burst.json" }
)

Write-Host "`n=== A/B Testing: Baseline vs Burst Protection ===" -ForegroundColor Cyan
Write-Host "Duration per test: $DurationMinutes minutes`n"

foreach ($test in $tests) {
    Write-Host "`n========================================" -ForegroundColor Magenta
    Write-Host "Running: $($test.Name.ToUpper())" -ForegroundColor Magenta
    Write-Host "========================================`n" -ForegroundColor Magenta
    
    # Deploy law
    Write-Host "Deploying $($test.Name) law..." -ForegroundColor Yellow
    Copy-Item "$InterlockPath\$($test.Law)" "$InterlockPath\laws\active\ollama.json" -Force
    
    # Clean logs for fresh start
    Remove-Item "$InterlockPath\logs\interlock_events.jsonl" -ErrorAction SilentlyContinue
    
    # Start the test
    Write-Host "Starting components..." -ForegroundColor Green
    $job = Start-Job -ScriptBlock {
        param($path)
        Set-Location $path
        & "$path\scripts\run_24h_loop.ps1"
    } -ArgumentList $InterlockPath
    
    # Wait for duration
    Write-Host "Test running for $DurationMinutes minutes..." -ForegroundColor Cyan
    $endTime = (Get-Date).AddMinutes($DurationMinutes)
    while ((Get-Date) -lt $endTime) {
        $remaining = [Math]::Round(($endTime - (Get-Date)).TotalMinutes, 1)
        Write-Host "`r  Time remaining: $remaining minutes" -NoNewline -ForegroundColor Gray
        Start-Sleep -Seconds 30
    }
    Write-Host ""
    
    # Stop components
    Write-Host "Stopping components..." -ForegroundColor Yellow
    Stop-Job $job
    Remove-Job $job
    Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
    
    # Archive results
    $timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $archivePath = "$InterlockPath\logs\archive\ab_$($test.Name)_$timestamp.jsonl"
    New-Item -ItemType Directory -Force -Path "$InterlockPath\logs\archive" | Out-Null
    Move-Item "$InterlockPath\logs\interlock_events.jsonl" $archivePath -Force
    
    Write-Host "Results archived: $archivePath" -ForegroundColor Green
    
    # Analyze
    Write-Host "Analyzing results..." -ForegroundColor Yellow
    & "$InterlockPath\scripts\analyze-telemetry.ps1" -LogPath $archivePath -OutputPath "$InterlockPath\results\ab_$($test.Name).json"
    
    # Wait before next test
    Write-Host "`nWaiting 30 seconds before next test...`n" -ForegroundColor Gray
    Start-Sleep -Seconds 30
}

Write-Host "`n=== Tests Complete ===" -ForegroundColor Green
Write-Host "Generating comparison report...`n" -ForegroundColor Cyan

# Generate comparison
& "$InterlockPath\scripts\compare_ab.ps1"
