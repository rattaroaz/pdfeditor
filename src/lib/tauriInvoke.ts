import { invoke } from "@tauri-apps/api/core";
import type { AppErrorPayload } from "@shared/types";
import { createCorrelationId } from "./correlation";
import { log } from "./logging";
import { normalizeInvokeError } from "./parseInvokeError";

export class AppInvokeError extends Error {
  readonly errorId: string;
  readonly code?: string;

  constructor(payload: AppErrorPayload) {
    super(payload.message);
    this.name = "AppInvokeError";
    this.errorId = payload.errorId;
    this.code = payload.code;
  }
}

export interface InvokeLoggedOptions {
  /** Reuse an existing trace id (e.g. parent save flow). */
  correlationId?: string;
}

export async function invokeLogged<T>(
  command: string,
  args?: Record<string, unknown>,
  options?: InvokeLoggedOptions,
): Promise<T> {
  const correlationId = options?.correlationId ?? createCorrelationId();
  const start = performance.now();
  log.invoke.debug(`invoke start: ${command}`, { userAction: command, correlationId });

  try {
    const result = await invoke<T>(command, args);
    const durationMs = Math.round(performance.now() - start);
    const payload = {
      userAction: command,
      durationMs,
      correlationId,
    };
    if (durationMs >= 2000) {
      log.invoke.warn(`invoke slow: ${command}`, payload);
    } else {
      log.invoke.debug(`invoke ok: ${command}`, payload);
    }
    return result;
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    const payload = normalizeInvokeError(err);
    if (payload) {
      log.invoke.error(`invoke failed: ${command}`, {
        userAction: command,
        errorId: payload.errorId,
        durationMs,
        correlationId,
      });
      throw new AppInvokeError(payload);
    }
    log.invoke.error(`invoke failed: ${command}`, {
      userAction: command,
      durationMs,
      correlationId,
    });
    throw err;
  }
}
