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

### Context fields

| Field | Purpose |
|-------|---------|
| `category` | Area: `app`, `document`, `pdf`, `form`, `security`, `invoke`, … |
| `userAction` | Short action id (`open`, `save`, `merge`, …) |
| `documentId` | Auto-filled from document store when a PDF is open |
| `durationMs` | Operation duration |
| `errorId` | Support correlation id |
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

Query log directory:

```typescript
import { fetchLoggingInfo, openLogDirectory, readBackendLogTail } from "@/services/loggingService";
```

Tauri commands: `get_logging_info`, `read_recent_log_lines`.

## Log Viewer (UI)

**View → View log panel** — live session buffer, level filter, min level control.  
**View → Open log folder** — opens the OS log directory in the file manager.

## Log file locations

| OS | Path |
|----|------|
| Windows | `%LOCALAPPDATA%\pdfeditor\logs\` |
| macOS | `~/Library/Application Support/pdfeditor/logs/` |
| Linux | `~/.local/share/pdfeditor/logs/` |

Files are named `pdfeditor.log.YYYY-MM-DD` (JSON per line in the file appender).

## Testing

Tests disable backend shipping via `logger.setBackendShipping(false)` when needed. See `src/lib/logging/` and `src/lib/logger.test.ts`.
