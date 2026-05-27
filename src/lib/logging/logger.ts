import { invoke } from "@tauri-apps/api/core";
import type { LogCategory, LogContext, LogEntry, LogLevel } from "@shared/types";
import { v4 as uuidv4 } from "uuid";
import { appendLogEntry } from "./buffer";
import { enrichLogContext } from "./context";

const SESSION_ID = uuidv4();
const STORAGE_KEY = "pdfeditor.logLevel";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function readStoredLevel(): LogLevel | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
  } catch {
    // private mode / tests
  }
  return null;
}

let minLevel: LogLevel =
  readStoredLevel() ?? (import.meta.env.DEV ? "debug" : "info");

let shipToBackend = true;

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];
}

function serializeContext(context: LogContext): string {
  const { metadata, ...rest } = context;
  const payload = metadata ? { ...rest, ...metadata } : rest;
  return JSON.stringify(payload);
}

function consoleWrite(level: LogLevel, line: string): void {
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (level === "debug") console.debug(line);
  else console.log(line);
}

async function shipToRust(
  level: LogLevel,
  message: string,
  context: LogContext,
): Promise<void> {
  if (!shipToBackend) return;
  try {
    await invoke("log_frontend_event", {
      level,
      message,
      sessionId: SESSION_ID,
      documentId: context.documentId ?? null,
      userAction: context.userAction ?? null,
      durationMs: context.durationMs ?? null,
      category: context.category ?? null,
      component: context.component ?? null,
      correlationId: context.correlationId ?? null,
      errorId: context.errorId ?? null,
      metadataJson:
        context.metadata && Object.keys(context.metadata).length > 0
          ? JSON.stringify(context.metadata)
          : null,
    });
  } catch {
    // Avoid recursive failures in tests / web-only mode
  }
}

function write(
  level: LogLevel,
  message: string,
  context?: LogContext,
): void {
  const enriched = enrichLogContext({
    sessionId: SESSION_ID,
    ...context,
  });

  const entry: LogEntry = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    level,
    message,
    sessionId: SESSION_ID,
    context: enriched,
  };

  appendLogEntry(entry);

  if (!shouldLog(level)) return;

  const category = enriched.category ? `[${enriched.category}]` : "";
  const action = enriched.userAction ? ` (${enriched.userAction})` : "";
  const line = `[${level.toUpperCase()}]${category}${action} ${message} ${serializeContext(enriched)}`;
  consoleWrite(level, line);
  void shipToRust(level, message, enriched);
}

export interface ScopedLogger {
  debug: (message: string, context?: LogContext) => void;
  info: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
  error: (message: string, context?: LogContext) => void;
  child: (scope: Partial<LogContext>) => ScopedLogger;
}

function mergeScope(
  base: Partial<LogContext>,
  context?: LogContext,
): LogContext {
  return {
    ...base,
    ...context,
    metadata: { ...base.metadata, ...context?.metadata },
  };
}

export function createLogger(scope: Partial<LogContext> = {}): ScopedLogger {
  const scoped = (context?: LogContext) => mergeScope(scope, context);
  return {
    debug: (message, context) => write("debug", message, scoped(context)),
    info: (message, context) => write("info", message, scoped(context)),
    warn: (message, context) => write("warn", message, scoped(context)),
    error: (message, context) => write("error", message, scoped(context)),
    child: (childScope) => createLogger(mergeScope(scope, childScope)),
  };
}

export const logger = {
  ...createLogger({ category: "app" }),

  setLevel(level: LogLevel) {
    minLevel = level;
    try {
      localStorage.setItem(STORAGE_KEY, level);
    } catch {
      // ignore
    }
  },

  getLevel(): LogLevel {
    return minLevel;
  },

  setBackendShipping(enabled: boolean) {
    shipToBackend = enabled;
  },

  get sessionId() {
    return SESSION_ID;
  },

  createLogger,
};

/** Pre-scoped loggers for broad coverage — use these across the codebase. */
export const log = {
  app: createLogger({ category: "app" }),
  document: createLogger({ category: "document" }),
  pdf: createLogger({ category: "pdf" }),
  annotation: createLogger({ category: "annotation" }),
  form: createLogger({ category: "form" }),
  content: createLogger({ category: "content" }),
  security: createLogger({ category: "security" }),
  assembly: createLogger({ category: "assembly" }),
  ui: createLogger({ category: "ui" }),
  invoke: createLogger({ category: "invoke" }),
  perf: createLogger({ category: "perf" }),
  system: createLogger({ category: "system" }),
} as const satisfies Record<LogCategory, ScopedLogger>;

export function logUserAction(
  action: string,
  message: string,
  level: LogLevel = "info",
  context?: LogContext,
): void {
  const payload = { userAction: action, category: "ui" as const, ...context };
  logger[level](message, payload);
}
