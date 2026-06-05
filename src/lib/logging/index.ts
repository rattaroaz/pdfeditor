export { logger, log, createLogger, logUserAction } from "./logger";
export type { ScopedLogger } from "./logger";
export { initLogging, shutdownLogging } from "./bootstrap";
export { startTimer } from "./timers";
export type { LogTimer } from "./timers";
export {
  appendLogEntry,
  getLogEntries,
  clearLogBuffer,
  subscribeLogBuffer,
} from "./buffer";
export { enrichLogContext } from "./context";
export { createCorrelationId } from "../correlation";

/** Log panel and verbose session tools — on in dev or when explicitly enabled. */
export function isLogViewerEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_ENABLE_LOG_VIEWER === "true";
}
export { reportError, toAppErrorPayload, createErrorReporter } from "../reportError";
export type { ReportErrorOptions } from "../reportError";
