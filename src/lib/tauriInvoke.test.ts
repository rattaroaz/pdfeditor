import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { clearLogBuffer, logger } from "@/lib/logging";
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
