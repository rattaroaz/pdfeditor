import { useMemo } from "react";
import { createLogger, type ScopedLogger } from "@/lib/logging";
import type { LogContext } from "@shared/types";

/** Returns a stable scoped logger for a React component or feature area. */
export function useLogger(component: string, base?: Partial<LogContext>): ScopedLogger {
  return useMemo(
    () => createLogger({ component, category: "ui", ...base }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scope identity is intentional per component name
    [component],
  );
}
