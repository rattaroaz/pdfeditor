# Build Windows installers for PDF Editor (NSIS setup.exe + optional MSI).
# Prerequisites: Node.js 20+, Rust, Visual Studio Build Tools, WebView2 (runtime installed on target PCs).
# See docs/install-windows.md

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "Building PDF Editor for Windows..." -ForegroundColor Cyan

$bundle = "nsis"
if ($args -contains "--msi") {
  $bundle = "msi"
} elseif ($args -contains "--all") {
  $bundle = "nsis,msi"
}

npm run tauri build -- --bundles $bundle
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$bundleDir = Join-Path $Root "src-tauri\target\release\bundle"
Write-Host ""
Write-Host "Build complete. Installers:" -ForegroundColor Green
Get-ChildItem -Path $bundleDir -Recurse -Include "*.exe", "*.msi" -ErrorAction SilentlyContinue |
  ForEach-Object { Write-Host "  $($_.FullName)" }
