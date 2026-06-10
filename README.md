# PDF Editor

Production-oriented desktop PDF editor built with **Tauri 2**, **React**, **TypeScript**, and **Rust**. Version **1.1.6** — open/view PDFs, zoom & navigation, text search, markup and content editing, forms, page tools, save, structured logging, and automated tests.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://www.rust-lang.org/tools/install) 1.77+
- Platform deps for Tauri: [https://tauri.app/start/prerequisites/](https://tauri.app/start/prerequisites/)

## Setup

```bash
npm install
cp .env.example .env
```

## Development

```bash
npm run tauri dev
```

Frontend only (no native shell):

```bash
npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run tauri dev` | Run desktop app in dev mode |
| `npm run build:installer` | Windows **NSIS** setup (`.exe` installer) |
| `npm run build:win` | NSIS + MSI installers |
| `npm run build:installer:msi` | Windows **MSI** only (requires WiX) |
| `npm run test` | Vitest unit tests (stores, libs, services) |
| `npm run test:coverage` | Coverage report |
| `cargo test` (in `src-tauri/`) | Rust PDF command unit tests |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |

## Windows installer

Build the setup executable on a Windows machine with [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) installed:

```powershell
npm install
npm run build:installer
```

The installer is created under `src-tauri/target/release/bundle/nsis/`. See [docs/install-windows.md](docs/install-windows.md) for MSI builds, code signing, and troubleshooting.

### In-app updates (automatic)

The app uses the **Tauri updater**: on startup (and via **Help → Check for updates**) it reads a signed `latest.json` from GitHub Releases and **only updates when the published version number is newer** than the installed app (for example `1.1.2` over `1.1.1`). Code changes without a version bump do not trigger an update.

**First-time install** still uses the NSIS `.exe` or MSI. After that, updates are applied in place.

#### Publish an update

1. Add the signing key to GitHub repo secrets (once):
   - `TAURI_SIGNING_PRIVATE_KEY` — contents of `scripts/tauri-signing.key` (generate with `npm run tauri signer generate -- -w scripts/tauri-signing.key --ci --force`)
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — the password for the key (required; the current key in `scripts/tauri-signing.key` is password-protected)

2. Tag and push:

```bash
git tag v1.1.6
git push origin v1.1.6
```

The [Release workflow](.github/workflows/release.yml) builds signed update artifacts, uploads `latest.json`, and attaches full installers for new users.

## Architecture

- **Frontend (`src/`)** — React UI, pdf.js rendering, Zustand state
- **Backend (`src-tauri/`)** — File I/O, PDF metadata (lopdf), logging (tracing), annotation persistence
- **Shared (`shared/`)** — TypeScript types shared across layers

Logs are written to:

- `%LOCALAPPDATA%\pdfeditor\logs\` (Windows)
- `~/Library/Application Support/pdfeditor/logs/` (macOS)
- `~/.local/share/pdfeditor/logs/` (Linux)

See [docs/logging.md](docs/logging.md) for the full logging framework (categories, scoped loggers, log viewer, and Rust integration).

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+O | Open |
| Ctrl+S | Save |
| Ctrl+Shift+S | Save As |
| Ctrl+F | Find |
| Ctrl+G | Go to page |
| Ctrl+± / Ctrl+0 | Zoom |

## Roadmap

See [roadmap.txt](./roadmap.txt) for the full phased plan toward ~90% Acrobat parity.

## License

MIT — see [LICENSE](./LICENSE).
