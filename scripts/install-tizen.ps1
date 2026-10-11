param([string]$TvAddress = $env:KINOWATCH_TV_ADDRESS, [string]$SdkRoot = $env:KINOWATCH_SDK_ROOT, [switch]$NoRun)
$ErrorActionPreference = 'Stop'
$kwProject = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$kwParsed = $null
if (-not [Net.IPAddress]::TryParse($TvAddress, [ref]$kwParsed) -or $kwParsed.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork) { throw 'Pass a valid TV IPv4 address.' }
if (-not $SdkRoot) {
    $kwCandidates = @('C:\tizen-studio', (Join-Path $env:USERPROFILE 'tizen-studio'))
    $SdkRoot = $kwCandidates | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'tools\ide\bin\tizen.bat') } | Select-Object -First 1
}
if (-not $SdkRoot -or -not (Test-Path -LiteralPath (Join-Path $SdkRoot 'tools\ide\bin\tizen.bat')) -or -not (Test-Path -LiteralPath (Join-Path $SdkRoot 'tools\sdb.exe'))) { throw 'Tizen SDK not found. Pass -SdkRoot or set KINOWATCH_SDK_ROOT.' }
$kwSdb = Join-Path $SdkRoot 'tools\sdb.exe'
$kwTizen = Join-Path $SdkRoot 'tools\ide\bin\tizen.bat'
$kwSerial = "${TvAddress}:26101"
$kwOutput = Join-Path $kwProject 'artifacts'
if (-not (Test-Path -LiteralPath (Join-Path $kwOutput 'KinoWatch.wgt'))) { throw 'Run npm run package first.' }
$kwConnection = & $kwSdb connect $kwSerial 2>&1 | Out-String
if ($LASTEXITCODE -ne 0 -or $kwConnection -notmatch 'connected') { throw 'TV unavailable. Check Developer Mode, network and the computer IP on TV.' }
$kwResult = & $kwTizen install -s $kwSerial -n KinoWatch.wgt -- $kwOutput 2>&1 | Out-String
if ($LASTEXITCODE -ne 0 -or $kwResult -notmatch 'success') { throw 'TV installation failed. Check Samsung TV distributor certificate and DUID.' }
Write-Output 'KinoWatch installed on TV.'
if (-not $NoRun) {
    $kwRun = & $kwTizen run -s $kwSerial -p KinoWatch1.App 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0 -or $kwRun -match '(?im)^\s*(Error:|Error code:|FAIL|failed)') { throw 'Installed, but launch was not confirmed. Open KinoWatch from Apps.' }
    Write-Output 'KinoWatch launched. On first launch, complete device-code login on your TV.'
}
