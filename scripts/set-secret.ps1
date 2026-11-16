[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$SecretName,

    [Parameter(Mandatory = $false)]
    [string]$Project = "cs-p3-production"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "Setting secret: $SecretName in project: $Project" -ForegroundColor Cyan
$secureVal = Read-Host -Prompt "Enter secret value for [$SecretName]" -AsSecureString

$bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureVal)
$plainVal = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

if ([string]::IsNullOrWhiteSpace($plainVal)) {
    Write-Error "Secret value cannot be empty."
    exit 1
}

# Check if secret already exists in Secret Manager
$null = gcloud secrets describe $SecretName --project=$Project 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Secret does not exist. Creating secret '$SecretName'..." -ForegroundColor Yellow
    gcloud secrets create $SecretName --replication-policy="automatic" --project=$Project
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to create secret $SecretName"
        exit 1
    }
} else {
    Write-Host "Secret '$SecretName' exists. Adding new version..." -ForegroundColor Green
}

# Add new version via stdin pipeline
$plainVal | gcloud secrets versions add $SecretName --data-file=- --project=$Project
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to add version to secret $SecretName"
    exit 1
}

# Overwrite in-memory value
$plainVal = $null
[System.GC]::Collect()

Write-Host "Successfully added version to secret: $SecretName" -ForegroundColor Green
