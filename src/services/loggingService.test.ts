import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { fetchLoggingInfo, readBackendLogTail } from "./loggingService";
import { clearLogBuffer, logger } from "@/lib/logging";

describe("loggingService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLogBuffer();
    logger.setBackendShipping(false);
  });

  it("fetchLoggingInfo merges backend and session metadata", async () => {
    vi.mocked(invoke).mockResolvedValue({
      logDirectory: "C:\\logs\\pdfeditor",
      appVersion: "1.1.1",
      rustLogFilter: "info",
    });

    const info = await fetchLoggingInfo();
    expect(info.logDirectory).toBe("C:\\logs\\pdfeditor");
    expect(info.appVersion).toBe("1.1.1");
    expect(info.sessionId).toBe(logger.sessionId);
    expect(info.minLevel).toBe(logger.getLevel());
  });

  it("readBackendLogTail requests lines from rust", async () => {
    vi.mocked(invoke).mockResolvedValue(["line one", "line two"]);
    const lines = await readBackendLogTail(50);
    expect(lines).toEqual(["line one", "line two"]);
    expect(invoke).toHaveBeenCalledWith("read_recent_log_lines", { maxLines: 50 });
  });
});
