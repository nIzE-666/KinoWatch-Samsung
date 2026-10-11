param([string]$SdkRoot = $env:KINOWATCH_SDK_ROOT, [string]$Profile = $env:KINOWATCH_CERT_PROFILE, [switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
if (-not $Profile) { throw 'Pass -Profile with your Samsung TV certificate profile name, or set KINOWATCH_CERT_PROFILE.' }
$kwProject = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $SdkRoot) {
    $kwCandidates = @('C:\tizen-studio', (Join-Path $env:USERPROFILE 'tizen-studio'))
    $SdkRoot = $kwCandidates | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'tools\ide\bin\tizen.bat') } | Select-Object -First 1
}
if (-not $SdkRoot -or -not (Test-Path -LiteralPath (Join-Path $SdkRoot 'tools\ide\bin\tizen.bat'))) { throw 'Tizen SDK not found. Pass -SdkRoot or set KINOWATCH_SDK_ROOT.' }
$kwTizen = Join-Path $SdkRoot 'tools\ide\bin\tizen.bat'
$kwOutput = Join-Path $kwProject 'artifacts'
Push-Location $kwProject
try {
    if (-not $SkipBuild) {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
    }
    if (-not (Test-Path -LiteralPath 'dist\config.xml')) { throw 'Run npm run build first.' }
    New-Item -ItemType Directory -Path $kwOutput -Force | Out-Null
    if (-not (Test-Path -LiteralPath 'dist\licenses')) { throw 'Dependency licenses missing. Use a complete build archive or run npm run build.' }
    # SDK diagnostics can contain certificate details: keep them out of console/repository.
    $kwStarted = Get-Date
    $kwResult = & $kwTizen package -t wgt -s $Profile -o $kwOutput -- (Join-Path $kwProject 'dist') 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0 -or $kwResult -match '(?im)^\s*(Error:|Error code:|FAIL|failed)') {
        throw 'Samsung packaging failed. Check the Samsung TV certificate profile in Certificate Manager.'
    }
    $kwWidget = Get-ChildItem -LiteralPath $kwOutput -Filter '*.wgt' | Where-Object { $_.LastWriteTime -ge $kwStarted.AddSeconds(-2) } | Sort-Object LastWriteTime | Select-Object -Last 1
    if (-not $kwWidget) { throw 'Samsung did not produce a widget.' }
    $kwTarget = Join-Path $kwOutput 'KinoWatch.wgt'
    if ($kwWidget.FullName -ne $kwTarget) { Copy-Item -LiteralPath $kwWidget.FullName -Destination $kwTarget -Force }
    Write-Output "Signed widget: $kwTarget"
} finally { Pop-Location }
