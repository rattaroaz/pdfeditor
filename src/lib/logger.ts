import { invoke } from "@tauri-apps/api/core";
import type { LogContext, LogLevel } from "@shared/types";
import { v4 as uuidv4 } from "uuid";

const SESSION_ID = uuidv4();

let minLevel: LogLevel = import.meta.env.DEV ? "debug" : "info";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];
}

function formatMessage(level: LogLevel, message: string, context?: LogContext): string {
  const ctx = context ? ` ${JSON.stringify(context)}` : "";
  return `[${level.toUpperCase()}] ${message}${ctx}`;
}

async function shipToRust(
  level: LogLevel,
  message: string,
  context?: LogContext,
): Promise<void> {
  try {
    await invoke("log_frontend_event", {
      level,
      message,
      sessionId: SESSION_ID,
      documentId: context?.documentId,
      userAction: context?.userAction,
      durationMs: context?.durationMs,
    });
  } catch {
    // Avoid recursive logging failures in tests / web-only mode
  }
}

function log(level: LogLevel, message: string, context?: LogContext): void {
  if (!shouldLog(level)) return;
  const line = formatMessage(level, message, {
    sessionId: SESSION_ID,
    ...context,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
  void shipToRust(level, message, context);
}

export const logger = {
  setLevel(level: LogLevel) {
    minLevel = level;
  },
  get sessionId() {
    return SESSION_ID;
  },
  debug: (message: string, context?: LogContext) => log("debug", message, context),
  info: (message: string, context?: LogContext) => log("info", message, context),
  warn: (message: string, context?: LogContext) => log("warn", message, context),
  error: (message: string, context?: LogContext) => log("error", message, context),
};
