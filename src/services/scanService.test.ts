import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeBase64Pdf } from "@/lib/pdf/pdfBinary";
import { useDocumentStore } from "@/stores/documentStore";

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const PDF_BASE64 = encodeBase64Pdf(PDF_BYTES);

const mockInvokeLogged = vi.hoisted(() => vi.fn());
const mockLoadPdf = vi.hoisted(() => vi.fn());
const mockConfirm = vi.hoisted(() => vi.fn());
const mockInsertImagePages = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tauriInvoke", () => ({
  invokeLogged: mockInvokeLogged,
}));

vi.mock("@/lib/tauriRuntime", () => ({
  requireTauriDesktop: () => undefined,
}));

vi.mock("@/lib/pdf/pdfEngine", () => ({
  decodeBase64Pdf: () => PDF_BYTES.slice(),
  loadPdfFromBytes: mockLoadPdf,
}));

vi.mock("@/services/documentService", () => ({
  confirmDiscardDocumentChanges: mockConfirm,
}));

vi.mock("@/services/pageService", () => ({
  insertImagePages: mockInsertImagePages,
}));

import { acquireScanPages, createPdfFromImages, insertScannedImages, listScanners } from "./scanService";

const images = [{ dataBase64: "abc", mimeType: "image/jpeg" }];

describe("scanService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadPdf.mockResolvedValue({ numPages: 1 });
    mockConfirm.mockResolvedValue(true);
    mockInsertImagePages.mockResolvedValue(undefined);
    useDocumentStore.setState({
      pdfDoc: null,
      pdfBytes: null,
      basePdfBytes: null,
      isLoading: false,
    });
  });

  it("listScanners invokes list_scanners", async () => {
    mockInvokeLogged.mockResolvedValue({ scanners: [{ id: "s1", name: "Desk" }], backend: "wia" });
    const result = await listScanners();
    expect(mockInvokeLogged).toHaveBeenCalledWith("list_scanners");
    expect(result.scanners).toHaveLength(1);
  });

  it("acquireScanPages keeps images even if cancelled is set", async () => {
    mockInvokeLogged.mockResolvedValue({ images, cancelled: true });
    await expect(acquireScanPages({ source: "flatbed" })).resolves.toEqual(images);
  });

  it("acquireScanPages maps cancelled results to an empty list", async () => {
    mockInvokeLogged.mockResolvedValue({ images: [], cancelled: true });
    await expect(acquireScanPages({ source: "flatbed" })).resolves.toEqual([]);
    expect(mockInvokeLogged).toHaveBeenCalledWith(
      "scan_pages",
      expect.objectContaining({
        source: "flatbed",
        maxPages: 1,
        preview: false,
        regionX: 0,
        regionY: 0,
        regionWidth: 1,
        regionHeight: 1,
      }),
    );
  });

  it("acquireScanPages sends preview and crop region", async () => {
    mockInvokeLogged.mockResolvedValue({ images: images, cancelled: false });
    await acquireScanPages({
      preview: true,
      source: "flatbed",
      region: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
    });
    expect(mockInvokeLogged).toHaveBeenCalledWith(
      "scan_pages",
      expect.objectContaining({
        preview: true,
        dpi: 75,
        regionX: 0.1,
        regionY: 0.2,
        regionWidth: 0.5,
        regionHeight: 0.4,
      }),
    );
  });

  it("createPdfFromImages opens a new unsaved document", async () => {
    mockInvokeLogged.mockResolvedValue({ dataBase64: PDF_BASE64 });
    const ok = await createPdfFromImages(images, { dpi: 200, paperSize: "letter" });
    expect(ok).toBe(true);
    expect(mockInvokeLogged).toHaveBeenCalledWith(
      "images_to_pdf",
      expect.objectContaining({ dpi: 200, paperSize: "letter", images }),
    );
    expect(useDocumentStore.getState().fileName).toMatch(/^Scanned-form-/);
    expect(useDocumentStore.getState().isDirty).toBe(true);
  });

  it("insertScannedImages inserts into an open document", async () => {
    useDocumentStore.setState({
      pdfBytes: PDF_BYTES,
      basePdfBytes: PDF_BYTES,
    });
    const ok = await insertScannedImages(images, 2, { dpi: 300, paperSize: "auto" });
    expect(ok).toBe(true);
    expect(mockInsertImagePages).toHaveBeenCalledWith(2, images, 300, "auto");
  });
});
