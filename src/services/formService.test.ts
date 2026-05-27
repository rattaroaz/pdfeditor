import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeBase64Pdf } from "@/lib/pdf/pdfBinary";
import { useDocumentStore } from "@/stores/documentStore";
import { useFormStore } from "@/stores/formStore";
import { useUiStore } from "@/stores/uiStore";

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const PDF_BASE64 = encodeBase64Pdf(PDF_BYTES);

const { mockInvokeLogged, mockLoadPdf, mockViewportRect } = vi.hoisted(() => ({
  mockInvokeLogged: vi.fn(),
  mockLoadPdf: vi.fn(),
  mockViewportRect: vi.fn(() => [41, 114, 266, 138] as [number, number, number, number]),
}));

vi.mock("@/lib/tauriInvoke", () => ({
  invokeLogged: mockInvokeLogged,
  AppInvokeError: class AppInvokeError extends Error {},
}));

vi.mock("@/lib/pdf/pdfEngine", () => ({
  encodeBase64Pdf: (bytes: Uint8Array) => encodeBase64Pdf(bytes),
  decodeBase64Pdf: () => PDF_BYTES.slice(),
  loadPdfFromBytes: mockLoadPdf,
  viewportRectToPdfRect: mockViewportRect,
}));

import { applyFormChanges, inspectDocumentForms } from "./formService";

const mockPdfDoc = {
  numPages: 2,
  isPureXfa: false,
  getPage: vi.fn().mockResolvedValue({}),
  getFieldObjects: vi.fn().mockResolvedValue(null),
};

describe("formService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFormStore.getState().clearFormState();
    useUiStore.setState({ lastError: null, showErrorDialog: false });
    useDocumentStore.setState({
      pdfBytes: PDF_BYTES,
      basePdfBytes: PDF_BYTES,
      pdfDoc: mockPdfDoc as never,
      rotation: 0,
      isLoading: false,
    });

    mockLoadPdf.mockResolvedValue(mockPdfDoc);
    mockInvokeLogged.mockImplementation(async (command: string) => {
      if (command === "create_form_fields" || command === "apply_form_values") {
        return { dataBase64: PDF_BASE64 };
      }
      if (command === "inspect_pdf_forms") {
        return { hasAcroform: true, hasXfa: false, fieldCount: 1 };
      }
      throw new Error(`unexpected invoke: ${command}`);
    });
  });

  it("returns true when there are no pending form changes", async () => {
    const ok = await applyFormChanges();
    expect(ok).toBe(true);
    expect(mockInvokeLogged).not.toHaveBeenCalled();
  });

  it("returns false when required fields are empty", async () => {
    useFormStore.getState().setFieldValue("name", "", "text");
    useFormStore.setState((s) => ({
      values: {
        ...s.values,
        name: { name: "name", value: "", type: "text", required: true },
      },
    }));

    const ok = await applyFormChanges();
    expect(ok).toBe(false);
    expect(mockInvokeLogged).not.toHaveBeenCalled();
    expect(useUiStore.getState().lastError?.message).toMatch(/required/i);
  });

  it("invokes create_form_fields when new fields are pending", async () => {
    useFormStore.getState().addNewField({
      pageIndex: 1,
      name: "Field1",
      kind: "text",
      x: 41,
      y: 100,
      width: 200,
      height: 24,
      defaultValue: "",
      required: false,
      readOnly: false,
    });

    const ok = await applyFormChanges();
    expect(ok).toBe(true);
    expect(mockInvokeLogged).toHaveBeenCalledWith(
      "create_form_fields",
      expect.objectContaining({
        pdfBase64: PDF_BASE64,
        fieldsJson: expect.stringContaining("Field1"),
      }),
    );
    expect(useFormStore.getState().newFields).toHaveLength(0);
  });

  it("invokes apply_form_values when values are present", async () => {
    useFormStore.getState().setFieldValue("existing", "hello", "text");

    const ok = await applyFormChanges();
    expect(ok).toBe(true);
    expect(mockInvokeLogged).toHaveBeenCalledWith(
      "apply_form_values",
      expect.objectContaining({
        valuesJson: expect.stringContaining("existing"),
      }),
    );
  });

  it("inspectDocumentForms updates the form store", async () => {
    const info = await inspectDocumentForms(PDF_BYTES);
    expect(info.fieldCount).toBe(1);
    expect(useFormStore.getState().formInfo?.fieldCount).toBe(1);
    expect(mockInvokeLogged).toHaveBeenCalledWith(
      "inspect_pdf_forms",
      expect.objectContaining({ pdfBase64: PDF_BASE64 }),
    );
  });
});
