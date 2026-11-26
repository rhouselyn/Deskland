param(
    [string]$NsisCompiler,
    [string]$WebView2Bootstrapper,
    [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$version = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'version.json') -Raw | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid package version' }
$dist = Join-Path $root 'dist'
$cache = Join-Path $dist 'installer-tools'
$payload = Join-Path $dist ('payload-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $cache, $payload | Out-Null
if (-not $SkipBuild) { & (Join-Path $root 'host\build.ps1') }

if (-not $NsisCompiler) {
    $nsisArchive = Join-Path $cache 'nsis-3.13.zip'
    $NsisCompiler = Join-Path $cache 'nsis-3.13\makensis.exe'
    if (-not (Test-Path -LiteralPath $NsisCompiler)) {
        Invoke-WebRequest 'https://downloads.sourceforge.net/project/nsis/NSIS%203/3.13/nsis-3.13.zip' -OutFile $nsisArchive -UseBasicParsing
        if ((Get-FileHash -LiteralPath $nsisArchive -Algorithm SHA256).Hash -ne 'BA63DFFC4410EE89193E1CB5A41989991BD77C61068DA17E3156D136B7B0B3D8') { throw 'NSIS archive checksum mismatch' }
        Expand-Archive -LiteralPath $nsisArchive -DestinationPath $cache -Force
    }
}
if (-not $WebView2Bootstrapper) {
    $WebView2Bootstrapper = Join-Path $cache 'MicrosoftEdgeWebview2Setup.exe'
    if (-not (Test-Path -LiteralPath $WebView2Bootstrapper)) {
        Invoke-WebRequest 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $WebView2Bootstrapper -UseBasicParsing
    }
}
$signature = Get-AuthenticodeSignature -LiteralPath $WebView2Bootstrapper
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation,') { throw 'WebView2 bootstrapper must have a valid Microsoft signature' }
if (-not (Test-Path -LiteralPath $NsisCompiler)) { throw 'NSIS compiler missing' }
$NsisCompiler = [IO.Path]::GetFullPath($NsisCompiler)
$WebView2Bootstrapper = [IO.Path]::GetFullPath($WebView2Bootstrapper)

# A fixed source list prevents other editions or private working files entering this package.
$sources = @('.gitattributes', '.gitignore', 'AGENTS.md', 'LICENSE', 'NOTICE', 'README.md', 'THIRD_PARTY_NOTICES.md', 'TRADEMARKS.md',
    'host\DesktopHost.cs', 'host\DesktopTaskbar.cs', 'host\DesktopIconLight.cs', 'host\Themes.cs', 'host\PastoralStore.cs', 'host\DesklandPreview.ico', 'host\README.md', 'host\app.manifest', 'host\build.ps1', 'host\inspect.ps1',
    'tools\test-pastoral.cjs', 'tools\test-taskbar.cjs', 'tools\build-installer.ps1', 'tools\installer.nsi', 'tools\version.json')
$themeFiles = @('pastoral.html', 'pastoral-world.js', 'pastoral-flock.js', 'pastoral-models.js', 'pastoral-scene.js', 'pastoral-light.js', 'pastoral-settings.js', 'vendor\suncalc.js', 'vendor\suncalc-LICENSE.txt', 'flat.html', 'meadow.html', 'autumn.html', 'meadow-scene.js', 'settings.html', 'thumbs-data.js', 'share.js', 'serve.mjs', 'themes.json', 'beach-palms.js', 'meadow-boy.js', 'meadow-cat.js',
    'i18n\en.json', 'i18n\zh-CN.json', 'thumbs\beach.webp', 'thumbs\meadow.webp',
    'assets\beach-coconut-palm-v2.png', 'assets\beach-coconut-palm-curved.png', 'assets\beach-coconut-palm-airy.png', 'assets\beach-coconut-palm-windswept.png', 'assets\beach-coconut-palm-arch.png',
    'assets\meadow-black-kitten.png', 'assets\meadow-kite-boy-level-face.png', 'assets\meadow-kite-boy-diagonal-run.png')
$themes = (Get-Content -LiteralPath (Join-Path $root 'prototype\themes.json') -Raw -Encoding UTF8 | ConvertFrom-Json).themes
$ready = @($themes | Where-Object { $_.status -eq 'ready' })
$locked = @($themes | Where-Object { $_.locked -eq $true })
if ($themes.Count -ne 15 -or $ready.Count -ne 4 -or $locked.Count -ne 11 -or (($ready.id | Sort-Object) -join ',' -ne 'autumn,beach,meadow,pastoral')) {
    throw 'Expected four usable themes and eleven locked preview cards'
}
foreach ($theme in $locked) {
    if ($theme.page -or $theme.groups) { throw 'Locked themes must not contain page source or settings' }
}
foreach ($theme in $themes) {
    $match = [regex]::Match([string]$theme.thumb, 'url\(thumbs/([^\)?]+)')
    if (-not $match.Success) { throw 'Missing thumbnail URL: ' + $theme.id }
    $thumbName = [uri]::UnescapeDataString($match.Groups[1].Value)
    if ($thumbName -notmatch '^[^\\/]+\.webp$') { throw 'Unexpected thumbnail path: ' + $thumbName }
    $thumbFile = 'thumbs\' + $thumbName
    if ($themeFiles -notcontains $thumbFile) { $themeFiles += $thumbFile }
}
$themeFiles += @('pastoral-village.js','pastoral-selection.js','pastoral-crop-circle.js')
$themeFiles += @('pets.js','pets.css','pet-preview.js')
$sources += @('host\DesktopPet.cs','tools\test-kurocat.cjs','tools\test-pet-settings.cs','tools\test-pet-runtime.ps1','tools\test-pet-render.mjs','tools\test-pet-animation.cjs','tools\test-pet-lifecycle.cjs')
$sources += @('tools\test-pigeon-flight.cjs','tools\test-flock-relocation.cjs','tools\test-pastoral-selection.cjs')
$sources += 'tools\test-pastoral-crop-circle.cjs'
$sources += @('tools\test-icon-light.cs','tools\test-pastoral-icon-selection.cjs')
$sources += @('host\KuroCat\build.ps1','host\KuroCat\build-preview.mjs','host\KuroCat\preview.ts')
$sources += Get-ChildItem -LiteralPath (Join-Path $root 'third_party\KuroCat') -File -Recurse -Force | Where-Object { $_.FullName -notmatch '\\(node_modules|target|target-win7|dist|dist-web|\.git)\\' } | ForEach-Object { $_.FullName.Substring($root.Length + 1) }
$sources += $themeFiles | ForEach-Object { 'prototype\' + $_ }
$sourceStage = Join-Path $payload 'source-stage'
foreach ($file in $sources) {
    $target = Join-Path $sourceStage $file
    New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
    Copy-Item -LiteralPath (Join-Path $root $file) -Destination $target
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($sourceStage, (Join-Path $payload 'Deskland-source.zip'))
# Only program data is installed. The accompanying ZIP contains the exact corresponding source.
$runtimeFiles = @('host\bin\Deskland.exe', 'host\bin\DesklandPreview.ico', 'host\bin\Microsoft.Web.WebView2.Core.dll', 'host\bin\Microsoft.Web.WebView2.WinForms.dll', 'host\bin\WebView2Loader.dll', 'host\bin\ExplorerTAP-2026.2.dll')
$runtimeFiles += 'host\bin\DesklandPet.exe'
$installFiles = @('third_party\KuroCat\LICENSE','third_party\KuroCat\src\assets\dafeiyu\LICENSE-MIT.txt','LICENSE', 'NOTICE', 'README.md', 'THIRD_PARTY_NOTICES.md', 'TRADEMARKS.md') + @($themeFiles | Where-Object { $_ -ne 'serve.mjs' } | ForEach-Object { 'prototype\' + $_ }) + $runtimeFiles
foreach ($file in $installFiles) {
    $target = Join-Path $payload $file
    New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
    Copy-Item -LiteralPath (Join-Path $root $file) -Destination $target
}
$installFiles += 'Deskland-source.zip'
$utf8 = New-Object Text.UTF8Encoding($true)
$fileLines = @()
$deleteLines = @()
$directories = @{}
foreach ($file in $installFiles) {
    if ($file -match '["$\r\n]') { throw 'Unsafe package path' }
    $dir = Split-Path $file
    $fileLines += 'SetOutPath "$INSTDIR' + $(if ($dir) { '\' + $dir } else { '' }) + '"'
    if ($file -eq 'host\bin\ExplorerTAP-2026.2.dll') { $fileLines += 'SetOverwrite off' }
    $fileLines += 'File "' + (Join-Path $payload $file) + '"'
    if ($file -eq 'host\bin\ExplorerTAP-2026.2.dll') { $fileLines += 'SetOverwrite on' }
    $deleteLines += 'Delete ' + $(if ($file -eq 'host\bin\ExplorerTAP-2026.2.dll') { '/REBOOTOK ' } else { '' }) + '"$INSTDIR\' + $file + '"'
    while ($dir) { $directories[$dir] = $true; $dir = Split-Path $dir }
}
$deleteLines += $directories.Keys | Sort-Object Length -Descending | ForEach-Object { 'RMDir "$INSTDIR\' + $_ + '"' }
$fileList = Join-Path $payload 'files.nsh'
$deleteList = Join-Path $payload 'delete.nsh'
[IO.File]::WriteAllLines($fileList, [string[]]$fileLines, $utf8)
[IO.File]::WriteAllLines($deleteList, [string[]]$deleteLines, $utf8)
$output = Join-Path $dist "Deskland-Preview-$version-win-x64-Setup.exe"
& $NsisCompiler /V2 "/DVERSION=$version" "/DPAYLOAD=$payload" "/DOUTPUT=$output" "/DBOOTSTRAPPER=$WebView2Bootstrapper" "/DFILE_LIST=$fileList" "/DDELETE_LIST=$deleteList" (Join-Path $PSScriptRoot 'installer.nsi')
if ($LASTEXITCODE -ne 0) { throw 'Installer compilation failed' }
$hash = (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash
[IO.File]::WriteAllText(($output + '.sha256'), "$hash  $([IO.Path]::GetFileName($output))`r`n", (New-Object Text.UTF8Encoding($false)))
$manifest = @($installFiles | ForEach-Object { @{ path = $_.Replace('\', '/'); sha256 = (Get-FileHash -LiteralPath (Join-Path $payload $_) -Algorithm SHA256).Hash } })
[IO.File]::WriteAllText(($output + '.manifest.json'), ($manifest | ConvertTo-Json -Depth 4), $utf8)
Write-Host "Installer: $output"
Write-Host "SHA256: $hash"
