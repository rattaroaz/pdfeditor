import { describe, expect, it, vi, beforeEach } from "vitest";
import { clearLogBuffer, logger } from "./logging";
import { invoke } from "@tauri-apps/api/core";

describe("logger compat re-export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLogBuffer();
    logger.setBackendShipping(true);
  });

  it("logs info messages to console", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("test message", { userAction: "test" });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("ships events to rust", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    logger.info("frontend event");
    await new Promise((r) => setTimeout(r, 0));
    expect(invoke).toHaveBeenCalledWith(
      "log_frontend_event",
      expect.objectContaining({ message: "frontend event" }),
    );
  });
});
