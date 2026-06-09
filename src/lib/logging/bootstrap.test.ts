import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearLogBuffer, getLogEntries, logger, shutdownLogging } from "./index";
import { initLogging } from "./bootstrap";

describe("initLogging", () => {
  beforeEach(() => {
    clearLogBuffer();
    shutdownLogging();
    logger.setBackendShipping(false);
    logger.setLevel("debug");
  });

  afterEach(() => {
    shutdownLogging();
  });

  it("registers global handlers and logs boot once", () => {
    initLogging();
    initLogging();

    const bootEntries = getLogEntries().filter(
      (e) => e.context?.userAction === "boot",
    );
    expect(bootEntries.length).toBe(1);
  });

  it("logs uncaught errors via the error handler", () => {
    initLogging();
    const event = new ErrorEvent("error", {
      message: "test boom",
      filename: "app.ts",
      lineno: 12,
      colno: 3,
    });
    window.dispatchEvent(event);

    expect(
      getLogEntries().some((e) => e.context?.userAction === "uncaught_error"),
    ).toBe(true);
  });

  it("logs unhandled rejections with the rejection message", () => {
    initLogging();
    const reason = new Error("reject");
    const event = new PromiseRejectionEvent("unhandledrejection", {
      promise: Promise.resolve(),
      reason,
    });
    window.dispatchEvent(event);

    const entry = getLogEntries().find(
      (e) => e.context?.userAction === "unhandled_rejection",
    );
    expect(entry?.message).toContain("reject");
  });

  it("does not duplicate handlers after re-init (e.g. Vite HMR)", () => {
    initLogging();
    initLogging();

    const reason = new Error("once");
    window.dispatchEvent(
      new PromiseRejectionEvent("unhandledrejection", {
        promise: Promise.resolve(),
        reason,
      }),
    );

    const rejectionEntries = getLogEntries().filter(
      (e) => e.context?.userAction === "unhandled_rejection",
    );
    expect(rejectionEntries.length).toBe(1);
  });
});
