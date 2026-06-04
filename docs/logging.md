# Logging framework

PDF Editor uses a unified logging stack across the React frontend and Rust backend. Logs are structured, correlated by session, and written to rotating files on disk.

## Architecture

```
Frontend (log.* / logger)
    ├── Console (dev-friendly text)
    ├── In-memory ring buffer (Log Viewer panel)
    └── Tauri invoke → log_frontend_event
              └── Rust tracing (target: frontend)
                        ├── stdout (human-readable)
                        └── logs/pdfeditor.log.YYYY-MM-DD (JSON lines)

Rust commands / PDF ops
    └── tracing spans + events → same log files
```

## Frontend usage

Import from `@/lib/logging`:

```typescript
import { log, logger, createLogger, startTimer, logUserAction, initLogging } from "@/lib/logging";

// Category-scoped loggers (preferred)
log.document.info("Document opened", { userAction: "open" });
log.form.warn("Validation failed", { metadata: { field: "email" } });
log.invoke.debug("…"); // used by invokeLogged automatically

// Custom scope
const logPalette = createLogger({ category: "ui", component: "ToolPalette" });
logPalette.info("Tool selected", { userAction: "select_tool", metadata: { tool: "highlight" } });

// Performance timing
const timer = startTimer(log.pdf, "renderPage", { userAction: "render" });
try {
  await renderPageToCanvas(page, canvas, scale);
  timer.end();
} catch (e) {
  timer.fail(e);
}

// High-level UI actions
logUserAction("save", "User saved document");
```

### User actions logged in the UI

| Area | `userAction` examples |
|------|------------------------|
| Toolbar / shortcuts | `open`, `save`, `undo`, `redo` |
| Forms | `place_form_field`, `form_save`, `flatten_forms` |
| Annotations | `add_annotation`, `remove_annotation`, `select_tool` |
| Content edit | `add_text_edit`, `add_image_edit`, `content_edit` |
| Pages | `delete_pages`, `rotate_pages` |
| Security | `protect_on_save`, `remove_password_on_save` |
| Document | `open`, `save`, `revert` (via `log.document`) |

### Context fields

| Field | Purpose |
|-------|---------|
| `category` | Area: `app`, `document`, `pdf`, `form`, `security`, `invoke`, … |
| `userAction` | Short action id (`open`, `save`, `merge`, …) |
| `documentId` | Auto-filled from document store when a PDF is open |
| `durationMs` | Operation duration |
| `errorId` | Support id — same value in error dialog and logs |
| `correlationId` | Trace id for one operation (save flow, invoke chain) |
| `component` | React component or module name |
| `metadata` | Arbitrary JSON-safe key/value pairs |

### Configuration

- **Dev default level:** `debug`
- **Production default:** `info`
- **Override:** `localStorage` key `pdfeditor.logLevel` or env `VITE_LOG_LEVEL`
- **Rust filter:** `RUST_LOG` env (default `info,pdfeditor=debug`)

`initLogging()` runs once in `main.tsx` and registers global `error` / `unhandledrejection` handlers.

## Backend usage

Rust uses `tracing` with daily log rotation (14 files retained) and a panic hook.

Frontend events arrive via `log_frontend_event` with `target: "frontend"`.

### Rust operations with spans and timing

| Module | Logged operations |
|--------|-------------------|
| `mod` | `read_pdf_file`, `write_pdf_file`, `get_pdf_info` |
| `pdf_forms` | inspect, create fields, apply values, flatten |
| `pdf_content` | apply content edits |
| `pdf_security` | inspect, encrypt, decrypt |
| `pdf_pages` | delete, rotate, reorder |
| `pdf_assembly` | insert blank, extract, merge |
| `pdf_annotations` | embed, strip, prepare bytes, save with annotations |

Each operation logs `elapsed_ms` and output size where applicable.

### Slow invoke warnings

`invokeLogged` emits a **warn** when a Tauri command takes ≥ 2000 ms (still logged at debug when faster). Each invoke gets a `correlationId` (auto-generated or passed in options).

### Errors (`reportError`)

Use `reportError` from `@/lib/logging` for user-visible failures:

```typescript
import { reportError } from "@/lib/logging";

reportError(err, { category: "document", userAction: "save", correlationId });
```

This logs once with the same `errorId` shown in the error dialog. `AppInvokeError` from `invokeLogged` preserves the backend id.

`createCorrelationId()` groups related steps (e.g. entire `savePdf` flow).

Query log directory:

```typescript
import { fetchLoggingInfo, openLogDirectory, readBackendLogTail } from "@/services/loggingService";
```

Tauri commands: `get_logging_info`, `read_recent_log_lines`.

## Log Viewer (UI)

**View → View log panel** — live session buffer (dev or `VITE_ENABLE_LOG_VIEWER=true`), shows `correlationId` and `errorId` when present.  
**View → Open log folder** — opens the OS log directory in the file manager.

## Log file locations

| OS | Path |
|----|------|
| Windows | `%LOCALAPPDATA%\pdfeditor\logs\` |
| macOS | `~/Library/Application Support/pdfeditor/logs/` |
| Linux | `~/.local/share/pdfeditor/logs/` |

Files are named `pdfeditor.log.YYYY-MM-DD` (JSON per line in the file appender).

## Testing

Tests disable backend shipping via `logger.setBackendShipping(false)` when needed. See:

- `src/lib/logging/logging.test.ts` — buffer, scoping, Rust shipping, timers, document context enrichment
- `src/lib/reportError.test.ts` — error id + correlation in logs and UI
- `src/lib/tauriInvoke.test.ts` — invoke success/failure + correlationId
- `src/lib/logger.test.ts` — compat re-exports
- `src/services/loggingService.test.ts` — `get_logging_info` / tail / open folder
- Rust: `src-tauri/src/logging.rs` (tail reader), `src-tauri/src/commands/mod.rs` (`log_frontend_payload` levels)

Service-layer tests (`formService.test.ts`, `documentService.test.ts`) mock `invokeLogged` and assert command order during save/apply flows.

### E2E (Playwright)

With `VITE_E2E=true`, mocks record `log_frontend_event` lines and Playwright asserts:

- Boot log (`userAction: boot`)
- `reportTestError` / forced invoke failures — dialog `errorId` matches session buffer (`data-testid="error-id"`, `log-entry`)
- Invoke tracing visible in **View log panel** (`invoke ok/failed: <command>`)

See `docs/testing.md` and `e2e/tests/logging.spec.ts`.
