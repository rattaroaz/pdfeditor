import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { fetchLoggingInfo, readBackendLogTail } from "./loggingService";
import { clearLogBuffer, getLogEntries, logger } from "@/lib/logging";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: vi.fn(),
}));

describe("loggingService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLogBuffer();
    logger.setBackendShipping(false);
  });

  it("fetchLoggingInfo merges backend and session metadata", async () => {
    vi.mocked(invoke).mockResolvedValue({
      logDirectory: "C:\\logs\\pdfeditor",
      appVersion: "1.0.0",
      rustLogFilter: "info",
    });

    const info = await fetchLoggingInfo();
    expect(info.logDirectory).toBe("C:\\logs\\pdfeditor");
    expect(info.appVersion).toBe("1.0.0");
    expect(info.sessionId).toBe(logger.sessionId);
    expect(info.minLevel).toBe(logger.getLevel());
  });

  it("readBackendLogTail requests lines from rust", async () => {
    vi.mocked(invoke).mockResolvedValue(["line one", "line two"]);
    const lines = await readBackendLogTail(50);
    expect(lines).toEqual(["line one", "line two"]);
    expect(invoke).toHaveBeenCalledWith("read_recent_log_lines", { maxLines: 50 });
  });

  it("openLogDirectory records a user action in the buffer", async () => {
    const { openLogDirectory } = await import("./loggingService");
    vi.mocked(invoke).mockResolvedValue({
      logDirectory: "C:\\logs\\pdfeditor",
      appVersion: "1.0.0",
      rustLogFilter: "info",
    });

    const { openPath } = await import("@tauri-apps/plugin-opener");
    vi.mocked(openPath).mockResolvedValue(undefined);

    await openLogDirectory();
    const entries = getLogEntries();
    expect(entries.some((e) => e.context?.userAction === "open_logs")).toBe(true);
  });
});
