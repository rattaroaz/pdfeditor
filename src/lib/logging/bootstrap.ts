import { logger, log } from "./logger";
import type { LogLevel } from "@shared/types";

let initialized = false;

function onGlobalError(event: ErrorEvent): void {
  log.system.error("Uncaught error", {
    userAction: "uncaught_error",
    metadata: {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    },
  });
}

function onUnhandledRejection(event: PromiseRejectionEvent): void {
  const reason = event.reason;
  const message = reason instanceof Error ? reason.message : String(reason);
  log.system.error("Unhandled promise rejection", {
    userAction: "unhandled_rejection",
    metadata: { message, stack: reason instanceof Error ? reason.stack : undefined },
  });
}

/** Install global handlers and log application startup. Call once from main.tsx. */
export function initLogging(): void {
  if (initialized) return;
  initialized = true;

  if (import.meta.env.VITE_LOG_LEVEL) {
    const level = import.meta.env.VITE_LOG_LEVEL as LogLevel;
    if (["debug", "info", "warn", "error"].includes(level)) {
      logger.setLevel(level);
    }
  }

  window.addEventListener("error", onGlobalError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);

  log.app.info("Frontend logging initialized", {
    userAction: "boot",
    metadata: {
      minLevel: logger.getLevel(),
      dev: import.meta.env.DEV,
      mode: import.meta.env.MODE,
    },
  });
}

export function shutdownLogging(): void {
  window.removeEventListener("error", onGlobalError);
  window.removeEventListener("unhandledrejection", onUnhandledRejection);
  initialized = false;
}
