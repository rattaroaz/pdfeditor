import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { runWithCorrelationId } from "@/lib/correlation";
import { clearLogBuffer, getLogEntries, logger } from "@/lib/logging";
import { AppInvokeError, invokeLogged } from "./tauriInvoke";

describe("invokeLogged", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLogBuffer();
    logger.setBackendShipping(false);
    logger.setLevel("debug");
  });

  it("returns invoke result on success", async () => {
    vi.mocked(invoke).mockResolvedValue({ ok: true });
    const result = await invokeLogged<{ ok: boolean }>("read_pdf_file", { path: "/x.pdf" });
    expect(result.ok).toBe(true);
    expect(invoke).toHaveBeenCalledWith("read_pdf_file", { path: "/x.pdf" });
  });

  it("threads correlationId through invoke logs", async () => {
    vi.mocked(invoke).mockResolvedValue({});
    await invokeLogged("get_pdf_info", { path: "/a.pdf" }, { correlationId: "trace-42" });
    const start = getLogEntries().find((e) => e.message.includes("invoke start"));
    expect(start?.context?.correlationId).toBe("trace-42");
  });

  it("inherits active correlation id from runWithCorrelationId", async () => {
    vi.mocked(invoke).mockResolvedValue({});
    await runWithCorrelationId("save-trace", async () => {
      await invokeLogged("save_annotations", { filePath: "/a.pdf", json: "[]" });
    });
    const start = getLogEntries().find((e) => e.message.includes("invoke start"));
    expect(start?.context?.correlationId).toBe("save-trace");
  });

  it("throws AppInvokeError for structured failures", async () => {
    vi.mocked(invoke).mockRejectedValue({
      errorId: "err-1",
      message: "disk full",
      code: "IO_ERROR",
    });
    await expect(invokeLogged("write_pdf_file", {})).rejects.toBeInstanceOf(AppInvokeError);
    await expect(invokeLogged("write_pdf_file", {})).rejects.toMatchObject({
      errorId: "err-1",
      message: "disk full",
      code: "IO_ERROR",
    });
  });

  it("rethrows unknown errors", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("network down"));
    await expect(invokeLogged("merge_pdfs", {})).rejects.toThrow("network down");
  });
});
