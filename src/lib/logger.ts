/**
 * @deprecated Import from `@/lib/logging` instead.
 * Re-exported for backward compatibility.
 */
export {
  logger,
  log,
  createLogger,
  logUserAction,
  initLogging,
  shutdownLogging,
  startTimer,
  getLogEntries,
  clearLogBuffer,
  subscribeLogBuffer,
} from "./logging";
export type { ScopedLogger, LogTimer } from "./logging";
