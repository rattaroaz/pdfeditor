import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeBase64Pdf } from "@/lib/pdf/pdfBinary";
import { useContentEditStore } from "@/stores/contentEditStore";
import { useDocumentStore } from "@/stores/documentStore";

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const PDF_BASE64 = encodeBase64Pdf(PDF_BYTES);

const mockInvokeLogged = vi.hoisted(() => vi.fn());
const mockLoadPdf = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tauriInvoke", () => ({
  invokeLogged: mockInvokeLogged,
}));

vi.mock("@/lib/pdf/pdfEngine", () => ({
  encodeBase64Pdf: (bytes: Uint8Array) => encodeBase64Pdf(bytes),
  decodeBase64Pdf: () => PDF_BYTES.slice(),
  loadPdfFromBytes: mockLoadPdf,
  viewportRectToPdfRect: () => [72, 700, 272, 724],
}));

import { applyContentEdits } from "./contentEditService";

const mockPdfDoc = { numPages: 1 };

describe("contentEditService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useContentEditStore.getState().clearEdits();
    useDocumentStore.setState({
      pdfBytes: PDF_BYTES,
      basePdfBytes: PDF_BYTES,
      isLoading: false,
      pdfDoc: { getPage: vi.fn().mockResolvedValue({}) } as never,
      rotation: 0,
    });
    mockLoadPdf.mockResolvedValue(mockPdfDoc);
    mockInvokeLogged.mockResolvedValue({ dataBase64: PDF_BASE64 });
  });

  it("returns true immediately when there are no edits", async () => {
    const ok = await applyContentEdits();
    expect(ok).toBe(true);
    expect(mockInvokeLogged).not.toHaveBeenCalled();
  });

  it("invokes apply_content_edits when text edits exist", async () => {
    useContentEditStore.getState().addTextEdit({
      pageIndex: 0,
      x: 72,
      y: 72,
      width: 200,
      height: 24,
      newText: "Hello",
      fontSize: 12,
      fontFamily: "Helvetica",
      color: "#000000",
      coverOld: true,
    });

    const ok = await applyContentEdits();
    expect(ok).toBe(true);
    const payload = mockInvokeLogged.mock.calls[0]?.[1] as { textEditsJson: string };
    const parsed = JSON.parse(payload.textEditsJson) as Array<{ newText: string; pdfX1: number }>;
    expect(parsed[0]?.newText).toBe("Hello");
    expect(parsed[0]?.pdfX1).toBe(72);
    expect(useContentEditStore.getState().hasEdits()).toBe(false);
  });
});
