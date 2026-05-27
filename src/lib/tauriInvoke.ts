import { invoke } from "@tauri-apps/api/core";
import type { AppErrorPayload } from "@shared/types";
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

export async function invokeLogged<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const start = performance.now();
  log.invoke.debug(`invoke start: ${command}`, { userAction: command });

  try {
    const result = await invoke<T>(command, args);
    log.invoke.debug(`invoke ok: ${command}`, {
      userAction: command,
      durationMs: Math.round(performance.now() - start),
    });
    return result;
  } catch (err) {
    const payload = normalizeInvokeError(err);
    if (payload) {
      log.invoke.error(`invoke failed: ${command}`, {
        userAction: command,
        errorId: payload.errorId,
        durationMs: Math.round(performance.now() - start),
      });
      throw new AppInvokeError(payload);
    }
    log.invoke.error(`invoke failed: ${command}`, {
      userAction: command,
      durationMs: Math.round(performance.now() - start),
    });
    throw err;
  }
}
