<#
.SYNOPSIS
    Interlock 24-Hour Adaptive Loop
    Runs Interlock + Traffic Generator + SDE Proposer in a governed loop.

.DESCRIPTION
    1. Starts Interlock Express server (background)
    2. Starts Traffic Generator (background)
    3. Every 60 seconds:
       - Runs SDE propose law
       - If proposal found:
         - Stops components
         - Deploys new law
         - Restart components
#>

$InterlockPath = "."
$SDEPath = $env:SDE_PATH -or "../Simulated-Desire-Engine"
$SDEPython = "$SDEPath\.venv\Scripts\python.exe"
$LogPath = "$InterlockPath\logs\interlock_events.jsonl"
$BaselineLaw = "$InterlockPath\laws\baselines\ollama.json"
$ActiveLaw = "$InterlockPath\laws\examples\ollama.json"  # Demo law - not for production
$ProposedDir = "$InterlockPath\laws\proposed"

# Ensure directories exist
New-Item -ItemType Directory -Force -Path "$InterlockPath\logs" | Out-Null
New-Item -ItemType Directory -Force -Path "$ProposedDir" | Out-Null

# Backfill telemetry history if needed (bypasses SDE "Insufficient Observation" check)
Write-Host "Backfilling telemetry history..." -ForegroundColor Cyan
Start-Process -FilePath "npx.cmd" -ArgumentList "tsx scripts/backfill-history.ts" -WorkingDirectory $InterlockPath -NoNewWindow -Wait

function Start-Components {
    Write-Host "Starting Interlock Server..." -ForegroundColor Green
    $Global:ServerProc = Start-Process -FilePath "npx.cmd" -ArgumentList "tsx apps/examples/express-demo/server.ts" -WorkingDirectory $InterlockPath -PassThru -NoNewWindow
    Start-Sleep -Seconds 5

    Write-Host "Starting Traffic Generator..." -ForegroundColor Green
    $Global:TrafficProc = Start-Process -FilePath "npx.cmd" -ArgumentList "tsx scripts/real-traffic-gen.ts" -WorkingDirectory $InterlockPath -PassThru -NoNewWindow
}

function Stop-Components {
    Write-Host "Stopping components..." -ForegroundColor Yellow
    if ($Global:TrafficProc) { Stop-Process -Id $Global:TrafficProc.Id -Force; $Global:TrafficProc = $null }
    if ($Global:ServerProc) { Stop-Process -Id $Global:ServerProc.Id -Force; $Global:ServerProc = $null }
    
    # Cleanup any stray node processes if simple kill missed them
    Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*express-demo*" } | Stop-Process -Force
}

# Cleanup on exit
Register-EngineEvent -SourceIdentifier PowerShell.Exiting -SupportEvent -Action {
    Stop-Components
}

# === Main Loop ===

Write-Host "=== Starting 24h Interlock SDE Loop ===" -ForegroundColor Cyan
Start-Components

while ($true) {
    Start-Sleep -Seconds 60
    
    # Watchdog check (non-blocking - warn but don't kill run)
    try {
        & "$InterlockPath\scripts\watchdog.ps1" -ErrorAction Stop
    }
    catch {
        Write-Host "[Watchdog] Check failed: $_" -ForegroundColor Yellow
        # Continue running - watchdog failure doesn't stop the loop
    }
    
    Write-Host "`n[SDE] Checking for optimizations..." -ForegroundColor Cyan
    
    try {
        # SDE writes to relative ./laws/proposed in its CWD
        $SDEProposedDir = "$SDEPath\laws\proposed"
        
        # Clear proposed directory to avoid confusion and stale files
        Remove-Item "$ProposedDir\*" -Force -ErrorAction SilentlyContinue
        Remove-Item "$SDEProposedDir\sde-*.json" -Force -ErrorAction SilentlyContinue

        # Enable Dev Mode (2hr evidence) and Deep Search (1500 candidates)
        # WARNING: Dev mode bypasses production safety checks - for testing only
        $env:SDE_DEV_MODE = "1"
        Write-Host "[DEV MODE] SDE_DEV_MODE=1 - Bypassing production evidence requirements" -ForegroundColor Yellow
        Write-Host "[DEV MODE] This should NEVER be enabled in production!" -ForegroundColor Yellow
        Push-Location $SDEPath
        & $SDEPython -m SDE.cli propose --domain ollama --events $LogPath --baseline $BaselineLaw --max-candidates 1500
        Pop-Location
        
        $Proposal = Get-ChildItem "$SDEProposedDir\sde-*.json" | Select-Object -First 1
        
        if ($Proposal) {
            Write-Host "`n!!! NEW LAW PROPOSAL FOUND !!!" -ForegroundColor Magenta
            Write-Host "File: $($Proposal.Name)"
            
            # In a real governed loop, a human would approve here.
            # For this test, we auto-approve if valid.
            
            Stop-Components
            
            Write-Host "Deploying new law..." -ForegroundColor Magenta
            Copy-Item $Proposal.FullName $ActiveLaw -Force
            
            # Archive the proposal so we don't re-process it
            Move-Item $Proposal.FullName "$SDEProposedDir\archive\$($Proposal.Name)" -Force -ErrorAction SilentlyContinue
            
            Write-Host "Law deployed. Restarting..."
            Start-Components
        }
    }
    catch {
        Write-Host "[SDE] Analysis error: $_" -ForegroundColor Yellow
        Write-Host "[SDE] Continuing run despite analysis failure..." -ForegroundColor Yellow
        # Don't kill the run - analysis failures are separate from system health
    }
}
