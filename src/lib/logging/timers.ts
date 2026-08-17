import type { LogContext } from "@shared/types";
import type { ScopedLogger } from "./logger";
import { recordMetric } from "./metrics";

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
    userAction: context?.userAction ?? operation,
  };

  return {
    end(message, extra) {
      const durationMs = Math.round(performance.now() - start);
      recordMetric({
        name: operation,
        durationMs,
        outcome: "ok",
        category: extra?.category ?? base.category,
      });
      scoped.info(message ?? `${operation} completed`, {
        ...base,
        ...extra,
        durationMs,
        outcome: "ok",
      });
    },
    fail(error, extra) {
      const durationMs = Math.round(performance.now() - start);
      const errMsg = error instanceof Error ? error.message : String(error);
      recordMetric({
        name: operation,
        durationMs,
        outcome: "fail",
        category: extra?.category ?? base.category,
      });
      scoped.error(`${operation} failed: ${errMsg}`, {
        ...base,
        ...extra,
        durationMs,
        outcome: "fail",
        metadata: {
          ...base.metadata,
          ...extra?.metadata,
          error: errMsg,
        },
      });
    },
  };
}
