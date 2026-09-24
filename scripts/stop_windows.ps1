# Stop and remove the FinAlly container (Windows PowerShell). The data volume is kept.
# Idempotent: does nothing if the container does not exist.
$ErrorActionPreference = 'Stop'

$Container = 'finally'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error 'docker is not installed or not on PATH.'
    exit 1
}

$existing = docker ps -a --format '{{.Names}}' | Where-Object { $_ -eq $Container }
if ($existing) {
    docker rm -f $Container | Out-Null
    Write-Host "Stopped and removed container '$Container' (volume 'finally-data' preserved)."
} else {
    Write-Host "Container '$Container' is not running."
}
