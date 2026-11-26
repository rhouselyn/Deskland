$ErrorActionPreference='Stop'
$repoRoot=Split-Path (Split-Path $PSScriptRoot)
$petRoot=Join-Path $repoRoot 'third_party\KuroCat'
$bin=Join-Path $repoRoot 'host\bin'
New-Item -ItemType Directory -Force $bin | Out-Null
Push-Location $petRoot
try {
    if(-not(Test-Path -LiteralPath 'node_modules\vite')){ & npm.cmd ci; if($LASTEXITCODE -ne 0){throw 'Pet dependencies failed'} }
    & npm.cmd run build
    if($LASTEXITCODE -ne 0){throw 'Pet frontend build failed'}
    & node.exe (Join-Path $PSScriptRoot 'build-preview.mjs')
    if($LASTEXITCODE -ne 0){throw 'Pet preview build failed'}
    Push-Location 'src-tauri'
    try { & cargo.exe build --release --locked; if($LASTEXITCODE -ne 0){throw 'Pet Rust build failed'} } finally { Pop-Location }
    Copy-Item -LiteralPath 'src-tauri\target\release\DesklandPet.exe' -Destination (Join-Path $bin 'DesklandPet.exe') -Force
} finally { Pop-Location }
Write-Host 'Deskland pet v4.7 built.'
