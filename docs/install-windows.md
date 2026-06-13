# Windows installer

PDF Editor is packaged for Windows using [Tauri 2](https://v2.tauri.app/distribute/windows-installer/). The build produces:

| Output | Format | Typical use |
|--------|--------|-------------|
| **NSIS setup** | `PDF Editor_x64-setup.exe` / `PDF Editor_arm64-setup.exe` | Recommended for end users (wizard installer) |
| **MSI** | `PDF Editor_x64_en-US.msi` / `PDF Editor_arm64_en-US.msi` | Enterprise / Group Policy deployment |
| **Portable** | `pdfeditor.exe` in `target/release/` | Run without installing |

Installers are written to:

`src-tauri/target/release/bundle/`

## Prerequisites (build machine)

1. [Node.js](https://nodejs.org/) 20+
2. [Rust](https://www.rust-lang.org/tools/install) (stable)
3. [Tauri prerequisites for Windows](https://v2.tauri.app/start/prerequisites/#windows) — Visual Studio Build Tools with C++ workload
4. **NSIS** — installed automatically by the Tauri CLI when building the NSIS bundle
5. **WiX Toolset v3** — required only for `.msi` builds ([download](https://wixtoolset.org/docs/wix3/)); enable the **VBScript** optional Windows feature if `light.exe` fails

Target PCs need the **WebView2** runtime. The installer uses `downloadBootstrapper` mode: if WebView2 is missing, the setup downloads it (internet required during install).

## Build commands

From the repository root:

```powershell
npm install
npm run build:installer
```

This runs a production frontend build and creates the **NSIS** setup executable.

Other options:

```powershell
# NSIS setup only (same as build:installer)
npm run tauri build -- --bundles nsis

# MSI only (requires WiX + VBScript)
npm run tauri build -- --bundles msi

# Both NSIS and MSI (installers only; updater signatures skipped without signing env vars)
npm run build:win

# Signed build with updater artifacts (same as CI release)
# $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "your-password"
# npm run build:win:signed

# Helper script
.\scripts\build-windows-installer.ps1
.\scripts\build-windows-installer.ps1 --msi
.\scripts\build-windows-installer.ps1 --all
```

## Install behavior

Configured in `src-tauri/tauri.conf.json`:

- **Per-user install** (`currentUser`) — no administrator rights required; installs under `%LOCALAPPDATA%`
- **Start menu** shortcut (Tauri default); uninstall via **Settings → Apps** as **PDF Editor**

## Code signing (optional)

For production distribution outside your organization, sign the installer with an Authenticode certificate to avoid SmartScreen warnings:

```json
"windows": {
  "certificateThumbprint": "YOUR_CERT_THUMBPRINT",
  "timestampUrl": "http://timestamp.digicert.com"
}
```

Add these fields under `bundle.windows` in `tauri.conf.json`. Signing is not required for local or internal use.

## Regenerating app icons

Icons live in `src-tauri/icons/`. To regenerate from the project artwork:

```powershell
npx tauri icon scripts/app-icon.png
```

## GitHub Releases (CI)

The [Release workflow](.github/workflows/release.yml) builds **both** NSIS (`.exe`) and MSI (`.msi`) for **x64** and **ARM64** Windows, attaches them to each GitHub Release, and publishes a merged `latest.json` for the in-app updater. The x64 job runs on `windows-latest`; the ARM64 job runs on `windows-11-arm` after x64 so `latest.json` includes both architectures without upload races. Both runners enable **VBScript** before the build because WiX requires it for MSI packaging.

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| `failed to run makensis` | Re-run build; ensure Tauri CLI can download NSIS, or install [NSIS](https://nsis.sourceforge.io/) manually |
| `failed to run light.exe` | Install WiX Toolset v3; enable Windows **VBScript** optional feature |
| WebView2 errors on launch | Install [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) |
| Build is slow first time | Normal — Rust compiles all dependencies; later builds are incremental |
