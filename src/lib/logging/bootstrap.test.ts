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

  it("logs unhandled rejections", () => {
    initLogging();
    const reason = new Error("reject");
    const event = new PromiseRejectionEvent("unhandledrejection", {
      promise: Promise.resolve(),
      reason,
    });
    window.dispatchEvent(event);

    expect(
      getLogEntries().some((e) => e.context?.userAction === "unhandled_rejection"),
    ).toBe(true);
  });
});
