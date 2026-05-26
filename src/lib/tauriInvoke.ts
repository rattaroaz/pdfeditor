import { invoke } from "@tauri-apps/api/core";
import type { AppErrorPayload } from "@shared/types";
import { logger } from "./logger";
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
  logger.debug(`invoke start: ${command}`, { userAction: command });

  try {
    const result = await invoke<T>(command, args);
    logger.debug(`invoke ok: ${command}`, {
      userAction: command,
      durationMs: Math.round(performance.now() - start),
    });
    return result;
  } catch (err) {
    const payload = normalizeInvokeError(err);
    if (payload) {
      logger.error(`invoke failed: ${command}`, {
        userAction: command,
        errorId: payload.errorId,
        durationMs: Math.round(performance.now() - start),
      });
      throw new AppInvokeError(payload);
    }
    logger.error(`invoke failed: ${command}`, {
      userAction: command,
      durationMs: Math.round(performance.now() - start),
    });
    throw err;
  }
}
