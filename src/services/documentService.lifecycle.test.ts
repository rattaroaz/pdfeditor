import { beforeEach, describe, expect, it, vi } from "vitest";
import { ask } from "@tauri-apps/plugin-dialog";
import { encodeBase64Pdf } from "@/lib/pdf/pdfBinary";
import { clearLogBuffer, getLogEntries, logger } from "@/lib/logging";
import { useAnnotationStore } from "@/stores/annotationStore";
import { useContentEditStore } from "@/stores/contentEditStore";
import { useDocumentStore } from "@/stores/documentStore";
import { useFormStore } from "@/stores/formStore";
import { useUiStore } from "@/stores/uiStore";

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const PDF_BASE64 = encodeBase64Pdf(PDF_BYTES);

const { mockInvokeLogged, mockLoadPdf } = vi.hoisted(() => ({
  mockInvokeLogged: vi.fn(),
  mockLoadPdf: vi.fn(),
}));

vi.mock("@/lib/tauriInvoke", () => ({
  invokeLogged: mockInvokeLogged,
  AppInvokeError: class AppInvokeError extends Error {},
}));

vi.mock("@/services/formService", () => ({
  applyFormChanges: vi.fn(),
  inspectDocumentForms: vi.fn().mockResolvedValue(undefined),
  loadFormFieldsFromPdf: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/contentEditService", () => ({
  applyContentEdits: vi.fn(),
}));

vi.mock("@/services/securityService", () => ({
  applySecurityOnSaveBytes: vi.fn(async (bytes: Uint8Array) => bytes),
  inspectPdfSecurity: vi.fn(),
}));

vi.mock("@/lib/pdf/pdfStorage", () => ({
  writePdfBytes: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/pdf/pdfEngine", () => ({
  encodeBase64Pdf: (bytes: Uint8Array) => encodeBase64Pdf(bytes),
  decodeBase64Pdf: () => PDF_BYTES.slice(),
  loadPdfFromBytes: mockLoadPdf,
  ensurePdfExtension: (path: string) => path,
  documentHasExtractableText: vi.fn().mockResolvedValue(true),
}));

import {
  closeDocument,
  confirmDiscardDocumentChanges,
  revertToSaved,
  savePdf,
} from "./documentService";

const mockPdfDoc = { numPages: 1, getFieldObjects: vi.fn().mockResolvedValue(null) };

function seedOpenDocument() {
  useDocumentStore.setState({
    documentId: "doc-1",
    filePath: "C:\\docs\\test.pdf",
    fileName: "test.pdf",
    pdfBytes: PDF_BYTES,
    basePdfBytes: PDF_BYTES,
    savedPdfBytes: PDF_BYTES,
    pdfDoc: mockPdfDoc as never,
    metadata: { pageCount: 1, fileSize: PDF_BYTES.length },
    isDirty: false,
    isLoading: false,
  });
}

describe("documentService lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLogBuffer();
    logger.setBackendShipping(false);
    logger.setLevel("debug");
    useFormStore.getState().clearFormState();
    useContentEditStore.getState().clearEdits();
    useUiStore.setState({ appMode: "document", showSearch: false, searchQuery: "", searchMatches: [], activeMatchIndex: 0 });
    useAnnotationStore.setState({ annotations: [] });
    mockLoadPdf.mockResolvedValue(mockPdfDoc);
    mockInvokeLogged.mockImplementation(async (command: string) => {
      if (command === "save_pdf_with_annotations") {
        return { dataBase64: PDF_BASE64, path: "C:\\docs\\test.pdf" };
      }
      if (command === "save_annotations") {
        return undefined;
      }
      if (command === "get_pdf_info") {
        return { metadata: { pageCount: 1, fileSize: PDF_BYTES.length } };
      }
      if (command === "load_annotations") {
        return null;
      }
      throw new Error(`unexpected invoke: ${command}`);
    });
    vi.mocked(ask).mockResolvedValue(true);
    seedOpenDocument();
  });

  describe("confirmDiscardDocumentChanges", () => {
    it("returns true immediately when the document is clean", async () => {
      useDocumentStore.setState({ isDirty: false });
      await expect(confirmDiscardDocumentChanges("Discard?")).resolves.toBe(true);
      expect(ask).not.toHaveBeenCalled();
    });

    it("prompts when the document is dirty", async () => {
      useDocumentStore.setState({ isDirty: true });
      vi.mocked(ask).mockResolvedValue(false);
      await expect(confirmDiscardDocumentChanges("Discard?")).resolves.toBe(false);
      expect(ask).toHaveBeenCalledWith("Discard?", expect.objectContaining({ kind: "warning" }));
    });
  });

  describe("closeDocument", () => {
    it("clears stores when the user confirms discard", async () => {
      useDocumentStore.setState({ isDirty: true });
      useAnnotationStore.getState().addAnnotation({
        type: "note",
        pageIndex: 0,
        author: "User",
        color: "#FFC107",
        x: 1,
        y: 2,
        content: "note",
      });

      await closeDocument();

      expect(useDocumentStore.getState().pdfDoc).toBeNull();
      expect(useAnnotationStore.getState().annotations).toHaveLength(0);
      expect(
        getLogEntries().some((entry) => entry.context?.userAction === "close"),
      ).toBe(true);
    });

    it("keeps the document open when discard is cancelled", async () => {
      useDocumentStore.setState({ isDirty: true });
      vi.mocked(ask).mockResolvedValue(false);

      await closeDocument();

      expect(useDocumentStore.getState().pdfDoc).not.toBeNull();
    });
  });

  describe("revertToSaved", () => {
    it("reloads saved bytes and clears dirty state", async () => {
      useDocumentStore.setState({ isDirty: true });
      useAnnotationStore.getState().addAnnotation({
        type: "highlight",
        pageIndex: 0,
        author: "User",
        color: "#FFEB3B",
        rects: [{ x: 0, y: 0, width: 10, height: 10 }],
      });

      await revertToSaved();

      expect(useDocumentStore.getState().isDirty).toBe(false);
      expect(useAnnotationStore.getState().annotations).toHaveLength(0);
      expect(
        getLogEntries().some((entry) => entry.context?.userAction === "revert"),
      ).toBe(true);
    });

    it("reports an error when there is no saved baseline", async () => {
      useDocumentStore.setState({ savedPdfBytes: null });
      await revertToSaved();
      expect(useDocumentStore.getState().isLoading).toBe(false);
    });
  });

  describe("runDocumentOperation queue", () => {
    it("serializes concurrent save operations", async () => {
      const order: string[] = [];
      mockInvokeLogged.mockImplementation(async (command: string) => {
        if (command === "save_pdf_with_annotations") {
          order.push("save-start");
          await new Promise((resolve) => setTimeout(resolve, 15));
          order.push("save-end");
          return { dataBase64: PDF_BASE64, path: "C:\\docs\\test.pdf" };
        }
        if (command === "save_annotations") return undefined;
        throw new Error(`unexpected invoke: ${command}`);
      });

      useDocumentStore.setState({ isDirty: true });
      await Promise.all([savePdf(), savePdf()]);

      expect(order).toEqual(["save-start", "save-end", "save-start", "save-end"]);
    });
  });
});
