# Start FinAlly in Docker (Windows PowerShell). Idempotent: safe to run repeatedly.
# Usage: .\scripts\start_windows.ps1 [-Build] [-Open]
param(
    [switch]$Build,
    [switch]$Open
)

$ErrorActionPreference = 'Stop'

$Image = 'finally'
$Container = 'finally'
$Volume = 'finally-data'
$Port = if ($env:PORT) { $env:PORT } else { '8000' }
$Url = "http://localhost:$Port"

Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error 'docker is not installed or not on PATH.'
    exit 1
}
docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Error 'The Docker daemon is not running. Start Docker Desktop and retry.'
    exit 1
}

# Build the image if requested or missing
docker image inspect $Image *> $null
$imageMissing = ($LASTEXITCODE -ne 0)
if ($Build -or $imageMissing) {
    Write-Host "Building image '$Image'..."
    docker build -t $Image .
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# .env is optional: without it the app still starts (chat returns a friendly error)
$envArgs = @()
if (Test-Path '.env') {
    $envArgs = @('--env-file', '.env')
} else {
    Write-Warning 'No .env file found. Starting without OPENROUTER_API_KEY; AI chat will be unavailable (copy .env.example to .env to enable it).'
}

# Remove any previous container (running or stopped); the volume is kept
$existing = docker ps -a --format '{{.Names}}' | Where-Object { $_ -eq $Container }
if ($existing) {
    Write-Host "Removing existing container '$Container'..."
    docker rm -f $Container | Out-Null
}

docker run -d --name $Container -v "${Volume}:/app/db" -p "${Port}:8000" @envArgs $Image | Out-Null
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Wait briefly for the health endpoint
Write-Host -NoNewline 'Waiting for FinAlly to become ready'
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "$Url/api/health" -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch { }
    Write-Host -NoNewline '.'
    Start-Sleep -Seconds 1
}
Write-Host ''

if ($ready) {
    Write-Host "FinAlly is running at $Url"
} else {
    Write-Warning "Container started but /api/health did not respond within 30s. Check logs with: docker logs $Container"
    Write-Host "Expected URL: $Url"
}

if ($Open) { Start-Process $Url }
