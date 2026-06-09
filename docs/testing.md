# Testing

## Frontend unit tests (Vitest)

```bash
npm run test
npm run test:watch
npm run test:coverage
```

- Tests live next to source (`*.test.ts` / `*.test.tsx`)
- Tauri APIs are mocked in `src/test/setup.ts`
- `src/test/setup.ts` also polyfills `PointerEvent` and pointer capture for jsdom (toolbar drag tests)
- Use `@testing-library/react` for component tests

### Coverage gates (CI)

`npm run test:coverage` enforces minimum thresholds on:

| Area | Lines (approx.) |
|------|-----------------|
| `src/lib/logging/**` | 85% |
| `src/stores/**` | 60% |
| `src/services/**` | 38% |

Components are excluded from thresholds (covered by services, E2E, and manual smoke). Ratchet thresholds up as coverage improves.

### Recently added coverage

| Area | Tests |
|------|-------|
| `updateService` | Up-to-date, apply flow, missing installer, dirty-doc cancel, invoke errors |
| `update.rs` | Commit matching, installer pick, `short_sha`, GitHub URL builder |
| `toolbarOrder` | Load/save, legacy migration, DOM insert helper |
| `ToolbarDragContext` | Drag reorder, ignore nested buttons |
| `UpdateDialog` | Phase titles and close behavior |
| `uiStore` | Update dialog state |
| `logging` | Min-level buffer vs console behavior |

## E2E (Playwright)

Browser-mode E2E runs the Vite app with **mocked Tauri IPC** (`VITE_E2E=true`). This exercises the real React UI, pdf.js, logging buffer, and error dialog without a desktop binary — ideal for CI on every PR.

```bash
npm install
npx playwright install chromium   # first time only
npm run test:e2e                  # starts dev:e2e + runs specs
npm run test:e2e:ui               # interactive debugger
npm run test:e2e:report           # open HTML report after a run
```

### Layout

| Path | Purpose |
|------|---------|
| `e2e/tests/*.spec.ts` | Playwright specs |
| `e2e/mocks/` | Tauri `invoke` / dialog / window shims |
| `e2e/helpers/` | Bridge + menu helpers |
| `playwright.config.ts` | Web server on port 1420 (`scripts/dev-e2e.mjs`) |
| `src/lib/e2eBridge.ts` | `window.__PDFEDITOR_E2E__` for logs and fixtures |

### Specs

1. **boot** — app shell loads; `boot` log entry exists
2. **open-document** — File → Open (mock path) or bridge `openFixtureDocument()`
3. **logging** — `reportTestError` correlates dialog `errorId` with session log; log panel lists invoke lines; forced `save_pdf_with_annotations` failure
4. **markup** — highlight / strikeout tool selection
5. **content-edit** — add text, preview, save; sync before mode switch
6. **save** — save dirty/clean document
7. **revert** — discard unsaved markup
8. **security** — password protection on save
9. **dropdown** — dropdown field placement/resize/text visibility
10. **update** — Help → Check for updates; up-to-date dialog; `update` category in session log

### E2E environment variables

Set in `scripts/dev-e2e.mjs` (also overridable):

- `VITE_E2E=true` — enable mocks + bridge
- `VITE_ENABLE_LOG_VIEWER=true` — log panel menu visible
- `VITE_LOG_LEVEL=debug` — verbose session logs

### Stable selectors

Interactive elements use `data-testid` (e.g. `menu-open`, `menu-check-updates`, `pdf-viewer`, `error-id`, `log-entry`, `tool-highlight`).

### Desktop E2E (optional)

For full native webview + Rust commands on **Windows/Linux**, see [Tauri WebDriver](https://v2.tauri.app/develop/tests/webdriver/) (`tauri-driver` + Edge/WebKit driver). macOS has no WKWebView WebDriver client yet. Browser-mode Playwright remains the default CI gate.

## Rust

```bash
cd src-tauri && cargo test --lib
```

Unit tests live in `#[cfg(test)]` modules beside command implementations (`pdf_forms`, `pdf_annotations`, `error`, `update`, etc.).

## Key test utilities

- `reportError` / `toAppErrorPayload` — unified error logging + dialog (`src/lib/reportError.test.ts`)
- `invokeLogged` — invoke contract + `correlationId` (`src/lib/tauriInvoke.test.ts`)
- `normalizeMarkupRect` — markup tools (`src/lib/annotationHitTest.test.ts`)
- `window.__PDFEDITOR_E2E__` — Playwright bridge (`e2e/helpers/bridge.ts`)

## Remaining gaps (lower priority)

- Viewer layers (`PdfViewer`, `AnnotationLayer`, `ContentEditLayer`, `PdfFormLayer`) — covered indirectly via E2E
- Native Rust HTTP integration for `check_for_updates` / `apply_app_update` (requires network mocks)
- E2E for toolbar drag-reorder persistence
- Split/merge PDF, search, and forms-mode workflows beyond dropdown spec
