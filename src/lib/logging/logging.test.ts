import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  clearLogBuffer,
  createLogger,
  getLogEntries,
  getMetricsSnapshot,
  logger,
  log,
  logUserAction,
  resetMetrics,
  startTimer,
} from "./index";

describe("logging framework", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLogBuffer();
    resetMetrics();
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

  it("records timer duration at info with metrics", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const timer = startTimer(log.perf, "unit-op", { userAction: "test" });
    timer.end("done");
    const entries = getLogEntries();
    const entry = entries[entries.length - 1];
    expect(entry?.level).toBe("info");
    expect(entry?.context?.category).toBe("perf");
    expect(entry?.context?.durationMs).toBeGreaterThanOrEqual(0);
    expect(entry?.context?.outcome).toBe("ok");
    expect(getMetricsSnapshot().operations[0]).toMatchObject({
      name: "unit-op",
      ok: 1,
      fail: 0,
    });
    spy.mockRestore();
  });

  it("buffers entries below the active min level but skips console shipping", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    logger.setLevel("info");

    log.app.debug("hidden from console", { userAction: "test" });
    log.app.info("visible in console", { userAction: "test" });

    expect(getLogEntries()).toHaveLength(2);
    expect(debugSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalled();

    logSpy.mockRestore();
    debugSpy.mockRestore();
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

  it("logUserAction sets ui category and userAction", () => {
    logUserAction("save", "User saved document", "info", {
      metadata: { path: "test.pdf" },
    });
    const entry = getLogEntries()[getLogEntries().length - 1];
    expect(entry?.context?.userAction).toBe("save");
    expect(entry?.context?.category).toBe("ui");
    expect(entry?.message).toBe("User saved document");
  });

  it("child logger merges nested scopes", () => {
    const parent = createLogger({ category: "document", component: "Save" });
    const child = parent.child({ component: "Dialog" });
    child.info("nested", { userAction: "test" });
    const entry = getLogEntries()[getLogEntries().length - 1];
    expect(entry?.context?.category).toBe("document");
    expect(entry?.context?.component).toBe("Dialog");
  });

  it("startTimer fail records error metadata and duration", () => {
    const timer = startTimer(log.perf, "failing-op", { userAction: "test" });
    timer.fail(new Error("boom"), { metadata: { step: "write" } });
    const entry = getLogEntries()[getLogEntries().length - 1];
    expect(entry?.level).toBe("error");
    expect(entry?.message).toContain("boom");
    expect(entry?.context?.durationMs).toBeGreaterThanOrEqual(0);
    expect(entry?.context?.metadata?.error).toBe("boom");
    expect(entry?.context?.metadata?.step).toBe("write");
    expect(entry?.context?.outcome).toBe("fail");
    expect(getMetricsSnapshot().operations[0]?.fail).toBe(1);
  });

  it("redacts password-like metadata", () => {
    log.security.info("scheduled", {
      userAction: "protect_on_save",
      metadata: { password: "secret123", pageCount: 2 },
    });
    const entry = getLogEntries()[getLogEntries().length - 1];
    expect(entry?.context?.metadata?.password).toBe("[redacted]");
    expect(entry?.context?.metadata?.pageCount).toBe(2);
  });

  it("persists min level in localStorage", () => {
    logger.setLevel("warn");
    expect(logger.getLevel()).toBe("warn");
    expect(localStorage.getItem("pdfeditor.logLevel")).toBe("warn");
    logger.setLevel("debug");
  });
});
