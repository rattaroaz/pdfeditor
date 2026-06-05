import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeBase64Pdf } from "@/lib/pdf/pdfBinary";
import { useAnnotationStore } from "@/stores/annotationStore";
import { useDocumentStore } from "@/stores/documentStore";

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const PDF_BASE64 = encodeBase64Pdf(PDF_BYTES);

const mockInvokeLogged = vi.hoisted(() => vi.fn());
const mockLoadPdf = vi.hoisted(() => vi.fn());
const mockRecordHistory = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tauriInvoke", () => ({
  invokeLogged: mockInvokeLogged,
}));

vi.mock("@/stores/historyStore", () => ({
  recordHistory: mockRecordHistory,
}));

vi.mock("@/lib/pdf/pdfEngine", () => ({
  encodeBase64Pdf: (bytes: Uint8Array) => encodeBase64Pdf(bytes),
  decodeBase64Pdf: () => PDF_BYTES.slice(),
  loadPdfFromBytes: mockLoadPdf,
}));

import { deletePages, insertBlankPages, reorderPages } from "./pageService";

const mockPdfDoc = { numPages: 2 };

describe("pageService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDocumentStore.setState({
      pdfBytes: PDF_BYTES,
      basePdfBytes: PDF_BYTES,
      isLoading: false,
    });
    useAnnotationStore.setState({ annotations: [] });
    mockLoadPdf.mockResolvedValue(mockPdfDoc);
    mockInvokeLogged.mockResolvedValue({ dataBase64: PDF_BASE64 });
  });

  it("deletePages invokes delete_pdf_pages with sorted page numbers", async () => {
    await deletePages([3, 1]);
    expect(mockRecordHistory).toHaveBeenCalled();
    expect(mockInvokeLogged).toHaveBeenCalledWith("delete_pdf_pages", {
      pdfBase64: PDF_BASE64,
      pageNumbers: [1, 3],
    });
  });

  it("insertBlankPages invokes insert_blank_pages", async () => {
    await insertBlankPages(1, 2);
    expect(mockInvokeLogged).toHaveBeenCalledWith("insert_blank_pages", {
      pdfBase64: PDF_BASE64,
      afterPage: 1,
      count: 2,
    });
  });

  it("reorderPages invokes reorder_pdf_pages", async () => {
    await reorderPages([2, 1]);
    expect(mockInvokeLogged).toHaveBeenCalledWith("reorder_pdf_pages", {
      pdfBase64: PDF_BASE64,
      newOrder: [2, 1],
    });
  });

  it("no-ops deletePages for empty selection", async () => {
    await deletePages([]);
    expect(mockInvokeLogged).not.toHaveBeenCalled();
  });
});
