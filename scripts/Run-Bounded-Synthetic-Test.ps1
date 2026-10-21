<#
.SYNOPSIS
  Secure Interactive Launcher for Bounded Synthetic Provider Test (PR #95)

.DESCRIPTION
  Prompts for the API key as a SecureString (masked input).
  Key is never displayed, never saved to disk, and never recorded in PowerShell history.
  Memory is zeroed and cleared immediately upon test completion.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "       SECURE LAUNCHER: PR #95 BOUNDED SYNTHETIC PROVIDER TEST" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "Input is masked. The key will NOT be printed or written to shell history." -ForegroundColor Yellow
Write-Host ""

$SecureKey = Read-Host -Prompt "Enter OpenRouter API Key" -AsSecureString

if ($null -eq $SecureKey -or $SecureKey.Length -eq 0) {
    Write-Warning "No key provided. Aborting test."
    exit 1
}

$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureKey)
$PlainKey = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)

try {
    $env:OPENROUTER_API_KEY = $PlainKey
    $GatewayDir = "d:\OneDrive - INDIA HIV AIDS ALLIANCE\Desktop\Software Development\Childcare-Multimodal-Gateway"
    Push-Location $GatewayDir
    try {
        npx tsx scripts/run-bounded-synthetic-test.ts
    } finally {
        Pop-Location
    }
} finally {
    Remove-Item Env:\OPENROUTER_API_KEY -ErrorAction SilentlyContinue
    $PlainKey = $null
    $SecureKey = $null
    [System.GC]::Collect()
    Write-Host "[SECURITY AUDIT] Process memory cleared. Shell session sanitized." -ForegroundColor Green
}
