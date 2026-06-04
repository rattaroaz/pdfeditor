import type { AppErrorPayload, LogCategory } from "@shared/types";
import { v4 as uuidv4 } from "uuid";
import { log } from "@/lib/logging";
import { errorMessage } from "@/lib/parseInvokeError";
import { normalizeInvokeError } from "@/lib/parseInvokeError";
import { useUiStore } from "@/stores/uiStore";

export interface ReportErrorOptions {
  category?: LogCategory;
  userAction?: string;
  correlationId?: string;
  /** Override log line; dialog still uses resolved message. */
  logMessage?: string;
}

function categoryLogger(category: LogCategory) {
  return log[category] ?? log.app;
}

/** Build a stable error payload from any thrown value. */
export function toAppErrorPayload(err: unknown): AppErrorPayload {
  const normalized = normalizeInvokeError(err);
  if (normalized) return normalized;
  return {
    errorId: uuidv4(),
    message: errorMessage(err),
  };
}

/**
 * Log once, show the same error id in the dialog, and return the payload for callers.
 */
export function reportError(err: unknown, options: ReportErrorOptions = {}): AppErrorPayload {
  const category = options.category ?? "app";
  const payload = toAppErrorPayload(err);
  const message = options.logMessage ?? payload.message;

  categoryLogger(category).error(message, {
    userAction: options.userAction,
    errorId: payload.errorId,
    correlationId: options.correlationId,
    metadata: payload.code ? { code: payload.code } : undefined,
  });

  useUiStore.getState().showError(payload);
  return payload;
}
