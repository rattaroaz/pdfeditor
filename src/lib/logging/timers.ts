import type { LogContext } from "@shared/types";
import type { ScopedLogger } from "./logger";

export interface LogTimer {
  end: (message?: string, extra?: LogContext) => void;
  fail: (error: unknown, extra?: LogContext) => void;
}

export function startTimer(
  scoped: ScopedLogger,
  operation: string,
  context?: LogContext,
): LogTimer {
  const start = performance.now();
  const base: LogContext = {
    ...context,
    category: context?.category ?? "perf",
    userAction: context?.userAction ?? operation,
  };

  return {
    end(message, extra) {
      scoped.debug(message ?? `${operation} completed`, {
        ...base,
        ...extra,
        durationMs: Math.round(performance.now() - start),
      });
    },
    fail(error, extra) {
      const errMsg = error instanceof Error ? error.message : String(error);
      scoped.error(`${operation} failed: ${errMsg}`, {
        ...base,
        ...extra,
        durationMs: Math.round(performance.now() - start),
        metadata: {
          ...base.metadata,
          ...extra?.metadata,
          error: errMsg,
        },
      });
    },
  };
}
