# deploy.ps1: pull-based CD for Pixel Racers
Set-Location $PSScriptRoot

$Image   = "ghcr.io/ambekardarshana/typing-race"
$Compose = @("-f", "compose.yaml", "-f", "compose.prod.yaml")
$BadFile = Join-Path $PSScriptRoot ".bad-image"
$LogFile = Join-Path $PSScriptRoot "deploy.log"

function Log($msg) {
    $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
    Write-Host $line
    Add-Content -Path $LogFile -Value $line
}

function Test-Health {
    for ($i = 1; $i -le 12; $i++) {
        try {
            $r = Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing -TimeoutSec 3
            if ($r.StatusCode -eq 200) { return $true }
        } catch { }
        Start-Sleep -Seconds 5
    }
    return $false
}

# 1. Abhi kaunsi image chal rahi hai?
$runningId = $null
$cid = docker compose @Compose ps -q app | Select-Object -First 1
if ($cid) { $runningId = docker inspect --format "{{.Image}}" $cid }

# 2. Naya image pull karo
docker compose @Compose pull app
if ($LASTEXITCODE -ne 0) { Log "Pull failed, skipping this run"; exit 1 }
$newId = docker image inspect "${Image}:latest" --format "{{.Id}}"

# 3. Kuch badla?
if ($newId -eq $runningId) { Log "No change"; exit 0 }
if ((Test-Path $BadFile) -and ((Get-Content $BadFile) -eq $newId)) {
    Log "Latest image is known-bad, skipping"; exit 0
}

# 4. Deploy
Log "Deploying new image $newId (old: $runningId)"
docker compose @Compose up -d --no-build

# 5. Health check
if (Test-Health) {
    Log "Deploy OK"
    if (Test-Path $BadFile) { Remove-Item $BadFile }
    exit 0
}

# Rollback
Log "Health check FAILED"
Set-Content -Path $BadFile -Value $newId
if ($runningId) {
    docker tag $runningId "${Image}:rollback"
    $env:IMAGE_TAG = "rollback"
    docker compose @Compose up -d --no-build
    Log "Rolled back to $runningId"
} else {
    Log "No previous image to roll back to"
}
exit 1