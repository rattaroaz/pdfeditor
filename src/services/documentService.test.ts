import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeBase64Pdf } from "@/lib/pdf/pdfBinary";
import { useAnnotationStore } from "@/stores/annotationStore";
import { useContentEditStore } from "@/stores/contentEditStore";
import { useDocumentStore } from "@/stores/documentStore";
import { useFormStore } from "@/stores/formStore";
import { useUiStore } from "@/stores/uiStore";

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const PDF_BASE64 = encodeBase64Pdf(PDF_BYTES);

const { mockInvokeLogged, mockApplyFormChanges, mockApplyContentEdits, mockLoadPdf } = vi.hoisted(() => ({
  mockInvokeLogged: vi.fn(),
  mockApplyFormChanges: vi.fn(),
  mockApplyContentEdits: vi.fn(),
  mockLoadPdf: vi.fn(),
}));

vi.mock("@/lib/tauriInvoke", () => ({
  invokeLogged: mockInvokeLogged,
  AppInvokeError: class AppInvokeError extends Error {},
}));

vi.mock("@/services/formService", () => ({
  applyFormChanges: mockApplyFormChanges,
  inspectDocumentForms: vi.fn().mockResolvedValue({ hasAcroform: false, hasXfa: false, fieldCount: 0 }),
  loadFormFieldsFromPdf: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/contentEditService", () => ({
  applyContentEdits: mockApplyContentEdits,
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
}));

import { savePdf } from "./documentService";

const mockPdfDoc = { numPages: 1, getFieldObjects: vi.fn().mockResolvedValue(null) };

describe("documentService savePdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFormStore.getState().clearFormState();
    useContentEditStore.getState().clearEdits();
    useUiStore.setState({ appMode: "document" });
    useAnnotationStore.setState({ annotations: [] });
    mockApplyFormChanges.mockResolvedValue(true);
    mockApplyContentEdits.mockResolvedValue(true);
    mockLoadPdf.mockResolvedValue(mockPdfDoc);
    mockInvokeLogged.mockImplementation(async (command: string) => {
      if (command === "save_pdf_with_annotations") {
        return { dataBase64: PDF_BASE64, path: "C:\\docs\\test.pdf" };
      }
      if (command === "save_annotations") {
        return undefined;
      }
      throw new Error(`unexpected invoke: ${command}`);
    });

    useDocumentStore.setState({
      filePath: "C:\\docs\\test.pdf",
      fileName: "test.pdf",
      pdfBytes: PDF_BYTES,
      basePdfBytes: PDF_BYTES,
      pdfDoc: mockPdfDoc as never,
      metadata: { pageCount: 1, fileSize: PDF_BYTES.length },
      isDirty: true,
      isLoading: false,
    });
  });

  it("applies form changes before embedding annotations when new fields exist", async () => {
    useFormStore.getState().addNewField({
      pageIndex: 0,
      name: "Field1",
      kind: "text",
      x: 10,
      y: 10,
      width: 100,
      height: 20,
      defaultValue: "",
      required: false,
      readOnly: false,
    });

    await savePdf();

    expect(mockApplyFormChanges).toHaveBeenCalledTimes(1);
    expect(mockInvokeLogged).toHaveBeenCalledWith(
      "save_pdf_with_annotations",
      expect.objectContaining({
        targetPath: "C:\\docs\\test.pdf",
        annotationsJson: "[]",
      }),
    );
  });

  it("skips form apply when there are no pending fields or values", async () => {
    await savePdf();

    expect(mockApplyFormChanges).not.toHaveBeenCalled();
    expect(mockInvokeLogged).toHaveBeenCalledWith(
      "save_pdf_with_annotations",
      expect.any(Object),
    );
  });

  it("skips form apply when loaded values match baseline", async () => {
    useFormStore.getState().setValuesFromPdf({
      existing: { name: "existing", value: "hello", type: "text" },
    });

    await savePdf();

    expect(mockApplyFormChanges).not.toHaveBeenCalled();
  });

  it("applies content edits before save when image edits exist", async () => {
    useContentEditStore.getState().addImageEdit({
      pageIndex: 0,
      x: 10,
      y: 20,
      width: 100,
      height: 80,
      imageBase64: "aGVsbG8=",
      mimeType: "image/png",
    });

    await savePdf();

    expect(mockApplyContentEdits).toHaveBeenCalledWith({ clearAfter: false });
    expect(mockApplyFormChanges).not.toHaveBeenCalled();
    expect(mockInvokeLogged).toHaveBeenCalledWith(
      "save_pdf_with_annotations",
      expect.any(Object),
    );
  });

  it("switches out of edit mode before applying content edits", async () => {
    useUiStore.setState({ appMode: "edit" });
    useContentEditStore.getState().addImageEdit({
      pageIndex: 0,
      x: 10,
      y: 20,
      width: 100,
      height: 80,
      imageBase64: "aGVsbG8=",
      mimeType: "image/png",
    });

    await savePdf();

    expect(useUiStore.getState().appMode).toBe("document");
    expect(mockApplyContentEdits).toHaveBeenCalledWith({ clearAfter: false });
  });

  it("embeds markup annotations after content and form changes", async () => {
    useAnnotationStore.getState().addAnnotation({
      type: "highlight",
      pageIndex: 0,
      rects: [{ x: 1, y: 2, width: 3, height: 4 }],
      author: "test",
      color: "#FFEB3B",
    });
    useFormStore.getState().setValuesFromPdf({
      field: { name: "field", value: "hello", type: "text" },
    });
    useFormStore.getState().setFieldValue("field", "changed", "text");

    await savePdf();

    expect(mockApplyContentEdits).not.toHaveBeenCalled();
    expect(mockApplyFormChanges).toHaveBeenCalledTimes(1);
    expect(mockInvokeLogged).toHaveBeenCalledWith(
      "save_pdf_with_annotations",
      expect.objectContaining({
        annotationsJson: expect.stringContaining("highlight"),
      }),
    );
  });
});
