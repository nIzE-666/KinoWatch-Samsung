$ErrorActionPreference = 'Stop'
$kwProject = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$kwDiagnostics = [Environment]::GetEnvironmentVariable('KINOWATCH_DIAGNOSTICS_URL', 'Process')
Push-Location $kwProject
try {
    # Public archives always contain the normal build, even after a diagnostic session.
    [Environment]::SetEnvironmentVariable('KINOWATCH_DIAGNOSTICS_URL', $null, 'Process')
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Release build failed.' }
    $kwPackage = Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json
    if ($kwPackage.version -notmatch '^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$') { throw 'Invalid release version.' }
    [xml]$kwConfig = Get-Content -LiteralPath 'dist\config.xml' -Raw
    if ($kwConfig.widget.version -ne $kwPackage.version) { throw 'Widget and package versions differ.' }
    $kwForbidden = Get-ChildItem -LiteralPath 'dist' -Recurse -File | Where-Object { $_.Name -match '(^profiles\.xml$|^author-signature\.xml$|^signature.*\.xml$|\.(p12|pfx|pem|key|wgt)$)' }
    if ($kwForbidden) { throw 'The public build must not contain signatures, certificates or signed widgets.' }
    if (-not (Test-Path -LiteralPath 'dist\licenses\hls.js.txt')) { throw 'Dependency licenses missing.' }
    $kwOutput = Join-Path $kwProject 'artifacts'
    New-Item -ItemType Directory -Path $kwOutput -Force | Out-Null
    $kwStage = Join-Path $kwOutput ('release-stage-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $kwStage | Out-Null
    try {
        Copy-Item -LiteralPath 'dist' -Destination $kwStage -Recurse
        Copy-Item -LiteralPath 'docs' -Destination $kwStage -Recurse
        Copy-Item -LiteralPath 'licenses' -Destination $kwStage -Recurse
        Copy-Item -LiteralPath '.cursor' -Destination $kwStage -Recurse
        foreach ($kwFile in @('README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'CONTRIBUTING.md', 'AGENTS.md')) {
            Copy-Item -LiteralPath $kwFile -Destination $kwStage
        }
        $kwScripts = Join-Path $kwStage 'scripts'
        New-Item -ItemType Directory -Path $kwScripts | Out-Null
        foreach ($kwFile in @('package-tizen.ps1', 'install-tizen.ps1')) {
            Copy-Item -LiteralPath (Join-Path 'scripts' $kwFile) -Destination $kwScripts
        }
        $kwArchive = Join-Path $kwOutput ('KinoWatch-' + $kwPackage.version + '-build.zip')
        if (Test-Path -LiteralPath $kwArchive) { Remove-Item -LiteralPath $kwArchive }
        Add-Type -AssemblyName System.IO.Compression
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $kwZip = [IO.Compression.ZipFile]::Open($kwArchive, [IO.Compression.ZipArchiveMode]::Create)
        try {
            foreach ($kwFile in Get-ChildItem -LiteralPath $kwStage -Recurse -Force -File) {
                $kwEntryName = $kwFile.FullName.Substring($kwStage.Length + 1).Replace('\', '/')
                [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($kwZip, $kwFile.FullName, $kwEntryName, [IO.Compression.CompressionLevel]::Optimal)
            }
        } finally { $kwZip.Dispose() }
        $kwStream = [IO.File]::OpenRead($kwArchive)
        $kwSha = [Security.Cryptography.SHA256]::Create()
        try {
            $kwHash = [BitConverter]::ToString($kwSha.ComputeHash($kwStream)).Replace('-', '').ToLowerInvariant()
        } finally {
            $kwStream.Dispose()
            $kwSha.Dispose()
        }
        ($kwHash + '  ' + [IO.Path]::GetFileName($kwArchive)) | Set-Content -LiteralPath ($kwArchive + '.sha256') -Encoding ascii
        Write-Output ('Public build archive: ' + $kwArchive)
    } finally {
        $kwStageResolved = [IO.Path]::GetFullPath($kwStage)
        $kwAllowedRoot = [IO.Path]::GetFullPath($kwOutput).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
        if (-not $kwStageResolved.StartsWith($kwAllowedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Release stage is outside artifacts; refusing cleanup.' }
        Remove-Item -LiteralPath $kwStageResolved -Recurse -Force
    }
} finally {
    [Environment]::SetEnvironmentVariable('KINOWATCH_DIAGNOSTICS_URL', $kwDiagnostics, 'Process')
    Pop-Location
}
