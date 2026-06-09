import { invoke } from "@tauri-apps/api/core";
import type { LoggingInfo } from "@shared/types";
import { logger } from "@/lib/logging";

export async function fetchLoggingInfo(): Promise<LoggingInfo> {
  const info = await invoke<{
    logDirectory: string;
    appVersion: string;
    rustLogFilter: string;
  }>("get_logging_info");

  return {
    logDirectory: info.logDirectory,
    appVersion: info.appVersion,
    sessionId: logger.sessionId,
    minLevel: logger.getLevel(),
    platform: typeof navigator !== "undefined" ? navigator.platform : "unknown",
  };
}

export async function readBackendLogTail(maxLines = 200): Promise<string[]> {
  return invoke<string[]>("read_recent_log_lines", { maxLines });
}
