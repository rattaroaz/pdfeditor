import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  clearLogBuffer,
  createLogger,
  getLogEntries,
  logger,
  log,
  startTimer,
} from "./index";

describe("logging framework", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLogBuffer();
    logger.setBackendShipping(false);
    logger.setLevel("debug");
  });

  it("buffers entries for the log viewer", () => {
    log.app.info("buffered", { userAction: "test" });
    expect(getLogEntries().length).toBe(1);
    expect(getLogEntries()[0]?.message).toBe("buffered");
  });

  it("scoped logger merges category", () => {
    const scoped = createLogger({ category: "form", component: "Test" });
    scoped.warn("scoped message");
    const entries = getLogEntries();
    const entry = entries[entries.length - 1];
    expect(entry?.context?.category).toBe("form");
    expect(entry?.context?.component).toBe("Test");
  });

  it("ships structured events to rust when enabled", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    logger.setBackendShipping(true);
    log.document.info("ship me", {
      userAction: "test",
      category: "document",
      metadata: { page: 1 },
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(invoke).toHaveBeenCalledWith(
      "log_frontend_event",
      expect.objectContaining({
        message: "ship me",
        category: "document",
        metadataJson: expect.stringContaining("page"),
      }),
    );
  });

  it("records timer duration", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const timer = startTimer(log.perf, "unit-op", { userAction: "test" });
    timer.end("done");
    const entries = getLogEntries();
    const entry = entries[entries.length - 1];
    expect(entry?.context?.durationMs).toBeGreaterThanOrEqual(0);
    spy.mockRestore();
  });

  it("enriches logs with document id from the store", async () => {
    const { useDocumentStore } = await import("@/stores/documentStore");
    useDocumentStore.setState({
      documentId: "doc-test-123",
      fileName: "sample.pdf",
    });
    log.document.info("with doc context", { userAction: "test" });
    const entry = getLogEntries()[getLogEntries().length - 1];
    expect(entry?.context?.documentId).toBe("doc-test-123");
    expect(entry?.context?.metadata?.fileName).toBe("sample.pdf");
  });
});
