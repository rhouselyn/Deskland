# 从源码构建 Deskland：使用 Windows 自带的 .NET Framework C# 编译器。
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$lib = Join-Path $root 'lib'
$bin = Join-Path $root 'bin'
& (Join-Path $root 'KuroCat\build.ps1')
New-Item -ItemType Directory -Force $lib, $bin | Out-Null
$version = '1.0.4191.47'
$assemblies = @(
    @{ Entry = 'lib/net462/Microsoft.Web.WebView2.Core.dll'; Name = 'Microsoft.Web.WebView2.Core.dll' },
    @{ Entry = 'lib/net462/Microsoft.Web.WebView2.WinForms.dll'; Name = 'Microsoft.Web.WebView2.WinForms.dll' },
    @{ Entry = 'runtimes/win-x64/native/WebView2Loader.dll'; Name = 'WebView2Loader.dll' }
)
$missing = @($assemblies | Where-Object { -not (Test-Path -LiteralPath (Join-Path $lib $_.Name)) })
if ($missing.Count -gt 0) {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = Join-Path ([IO.Path]::GetTempPath()) ('deskland-webview2-' + [Guid]::NewGuid().ToString('N') + '.zip')
    $package = $null
    try {
        Write-Host "下载 WebView2 SDK $version..."
        Invoke-WebRequest "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$version/microsoft.web.webview2.$version.nupkg" -OutFile $archive -UseBasicParsing
        $package = [IO.Compression.ZipFile]::OpenRead($archive)
        foreach ($assembly in $assemblies) {
            $entry = $package.GetEntry($assembly.Entry)
            if ($null -eq $entry) { throw "依赖包缺少 $($assembly.Entry)" }
            $sourceStream = $entry.Open()
            $targetStream = $null
            try {
                $targetStream = [IO.File]::Create((Join-Path $lib $assembly.Name))
                $sourceStream.CopyTo($targetStream)
            } finally {
                if ($null -ne $targetStream) { $targetStream.Dispose() }
                $sourceStream.Dispose()
            }
        }
    } finally {
        if ($null -ne $package) { $package.Dispose() }
        if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
    }
}
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
# Only the background helper is used; no TranslucentTB app or updater is installed.
$tapArchive = Join-Path $lib 'TranslucentTB-portable-x64.zip'
$tapHash = '0DBE8E0255C20E131CDE536DCD0AE490D45989A7D360E26D0150DFF1922AC420'
if (-not (Test-Path -LiteralPath $tapArchive)) {
    Invoke-WebRequest 'https://github.com/TranslucentTB/TranslucentTB/releases/download/2026.2/TranslucentTB-portable-x64.zip' -OutFile $tapArchive -UseBasicParsing
}
if ((Get-FileHash -LiteralPath $tapArchive -Algorithm SHA256).Hash -ne $tapHash) { throw 'ExplorerTAP archive checksum mismatch' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$tapPackage = [IO.Compression.ZipFile]::OpenRead($tapArchive)
try {
    [IO.Compression.ZipFileExtensions]::ExtractToFile($tapPackage.GetEntry('ExplorerTAP.dll'), (Join-Path $lib 'ExplorerTAP.dll'), $true)
} finally { $tapPackage.Dispose() }
if (-not (Test-Path -LiteralPath $csc)) { throw '找不到 .NET Framework C# 编译器，请在 64 位 Windows 上构建。' }
$appVersion = (Get-Content -LiteralPath (Join-Path $root '..\tools\version.json') -Raw | ConvertFrom-Json).version
if ($appVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid application version' }
$versionSource = Join-Path $bin 'Deskland-version.cs'
$versionText = @"
using System.Reflection;
[assembly: AssemblyTitle("Deskland Preview")]
[assembly: AssemblyProduct("Deskland Preview")]
[assembly: AssemblyVersion("$appVersion.0")]
[assembly: AssemblyFileVersion("$appVersion.0")]
[assembly: AssemblyCopyright("Copyright 2026 Deskland authors")]
"@
[IO.File]::WriteAllText($versionSource, $versionText, (New-Object Text.UTF8Encoding($false)))
& $csc /nologo /target:winexe /platform:x64 /optimize+ /codepage:65001 /win32manifest:"$root\app.manifest" `
    /win32icon:"$root\DesklandPreview.ico" `
    /out:"$bin\Deskland.exe" `
    /r:System.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll /r:System.Web.Extensions.dll `
    /r:"$lib\Microsoft.Web.WebView2.Core.dll" /r:"$lib\Microsoft.Web.WebView2.WinForms.dll" `
    "$root\DesktopTaskbar.cs" "$root\DesktopIconLight.cs" "$root\DesktopPet.cs" "$root\DesktopHost.cs" "$root\Themes.cs" "$root\PastoralStore.cs" "$versionSource"
if ($LASTEXITCODE -ne 0) { throw '编译失败' }
foreach ($assembly in $assemblies) { Copy-Item -LiteralPath (Join-Path $lib $assembly.Name) -Destination $bin -Force }
$tapTarget = Join-Path $bin 'ExplorerTAP-2026.2.dll'
# Explorer pins this DLL until logout. Keep each version immutable and skip identical copies.
if (-not (Test-Path -LiteralPath $tapTarget) -or
    (Get-FileHash -LiteralPath $tapTarget).Hash -ne (Get-FileHash -LiteralPath (Join-Path $lib 'ExplorerTAP.dll')).Hash) {
    Copy-Item -LiteralPath (Join-Path $lib 'ExplorerTAP.dll') -Destination $tapTarget -Force
}
Copy-Item -LiteralPath (Join-Path $root 'DesklandPreview.ico') -Destination (Join-Path $bin 'DesklandPreview.ico') -Force
Write-Host "编译完成：$bin\Deskland.exe"
