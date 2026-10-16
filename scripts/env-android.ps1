<#
.SYNOPSIS
  Session-local Android, Java, and Gradle environment activation for Childcare Support Phase 3.

.DESCRIPTION
  IMPORTANT: To persist these environment variables into your CURRENT PowerShell session,
  you MUST DOT-SOURCE this script:
    . .\scripts\env-android.ps1

  Do NOT execute it as a standalone script (e.g., .\scripts\env-android.ps1), which runs in
  a child subshell and discards variables upon exit.

.NOTES
  Confines large tooling, SDK downloads, and build caches to Drive D:.
  Standard OS-level temporary files and user profile metadata may still use C:\Users.
#>

# 1. Java 21 LTS
$env:JAVA_HOME = "D:\DevTools\jdk-21"

# 2. Android SDK & CLI Tools
$env:ANDROID_HOME = "D:\Android\Sdk"
$env:ANDROID_SDK_ROOT = "D:\Android\Sdk"

# 3. User Caches & Keystores (Redirected to D:)
$env:ANDROID_USER_HOME = "D:\Android\.android"
$env:ANDROID_AVD_HOME = "D:\Android\.android\avd"
$env:GRADLE_USER_HOME = "D:\.gradle"
$env:ANDROID_BUILD_DIR = "D:\Android\build\childcare"

# 4. Optional Temp directory redirection to D: to minimize C: disk usage
if (!(Test-Path "D:\Temp")) {
    New-Item -ItemType Directory -Force -Path "D:\Temp" | Out-Null
}
$env:TEMP = "D:\Temp"
$env:TMP = "D:\Temp"

# 5. Prepend Session PATH
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " CHILDCARE SUPPORT: SESSION-LOCAL ANDROID ENVIRONMENT LOADED " -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " JAVA_HOME:         $env:JAVA_HOME"
Write-Host " ANDROID_HOME:      $env:ANDROID_HOME"
Write-Host " GRADLE_USER_HOME:  $env:GRADLE_USER_HOME"
Write-Host " ANDROID_USER_HOME: $env:ANDROID_USER_HOME"
Write-Host " npm_config_cache:  $env:npm_config_cache"
Write-Host " TEMP / TMP:        $env:TEMP"
Write-Host " PATH (Java/SDK):   Enabled in current shell"
Write-Host "============================================================" -ForegroundColor Cyan
