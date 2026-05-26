# PDF Editor

Production-oriented desktop PDF editor built with **Tauri 2**, **React**, **TypeScript**, and **Rust**. Covers the MVP roadmap: open/view PDFs, zoom & navigation, text search, annotations, save, structured logging, and automated tests.

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
| `npm run tauri build` | Production installer |
| `npm run test` | Vitest unit tests |
| `npm run test:coverage` | Coverage report |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |

## Architecture

- **Frontend (`src/`)** — React UI, pdf.js rendering, Zustand state
- **Backend (`src-tauri/`)** — File I/O, PDF metadata (lopdf), logging (tracing), annotation persistence
- **Shared (`shared/`)** — TypeScript types shared across layers

Logs are written to:

- `%LOCALAPPDATA%\pdfeditor\logs\` (Windows)
- `~/Library/Application Support/pdfeditor/logs/` (macOS)
- `~/.local/share/pdfeditor/logs/` (Linux)

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
