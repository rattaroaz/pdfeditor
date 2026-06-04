import { beforeEach, describe, expect, it } from "vitest";
import { clearLogBuffer, getLogEntries, logger } from "@/lib/logging";
import { useUiStore } from "@/stores/uiStore";
import { AppInvokeError } from "@/lib/tauriInvoke";
import { reportError, toAppErrorPayload } from "./reportError";

describe("toAppErrorPayload", () => {
  it("preserves structured invoke error ids", () => {
    const err = new AppInvokeError({
      errorId: "backend-id",
      message: "disk full",
      code: "IO_ERROR",
    });
    expect(toAppErrorPayload(err)).toEqual({
      errorId: "backend-id",
      message: "disk full",
      code: "IO_ERROR",
    });
  });

  it("preserves raw invoke payload objects", () => {
    expect(
      toAppErrorPayload({ errorId: "raw-id", message: "fail", code: "PDF_ERROR" }),
    ).toEqual({ errorId: "raw-id", message: "fail", code: "PDF_ERROR" });
  });
});

describe("reportError", () => {
  beforeEach(() => {
    clearLogBuffer();
    logger.setBackendShipping(false);
    logger.setLevel("debug");
    useUiStore.setState({ lastError: null, showErrorDialog: false });
  });

  it("logs and shows the same error id for invoke failures", () => {
    const err = new AppInvokeError({
      errorId: "invoke-99",
      message: "PDF corrupt",
      code: "PDF_ERROR",
    });

    const payload = reportError(err, {
      category: "document",
      userAction: "open",
      correlationId: "corr-1",
    });

    expect(payload.errorId).toBe("invoke-99");
    expect(useUiStore.getState().lastError?.errorId).toBe("invoke-99");
    expect(useUiStore.getState().showErrorDialog).toBe(true);

    const last = getLogEntries().at(-1);
    expect(last?.context?.errorId).toBe("invoke-99");
    expect(last?.context?.correlationId).toBe("corr-1");
  });

  it("logs correlation id on generic errors", () => {
    reportError(new Error("boom"), {
      category: "form",
      userAction: "form_save",
      correlationId: "corr-abc",
    });

    const last = getLogEntries().at(-1);
    expect(last?.level).toBe("error");
    expect(last?.context?.errorId).toBeTruthy();
    expect(last?.context?.correlationId).toBe("corr-abc");
    expect(last?.context?.userAction).toBe("form_save");
  });
});
