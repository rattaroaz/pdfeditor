import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeBase64Pdf } from "@/lib/pdf/pdfBinary";
import { useDocumentStore } from "@/stores/documentStore";
import { useFormStore } from "@/stores/formStore";
import { useUiStore } from "@/stores/uiStore";

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const PDF_BASE64 = encodeBase64Pdf(PDF_BYTES);

const { mockInvokeLogged, mockLoadPdf, mockViewportRect, mockWriteTextFile, mockReadTextFile } = vi.hoisted(() => ({
  mockInvokeLogged: vi.fn(),
  mockLoadPdf: vi.fn(),
  mockViewportRect: vi.fn(() => [41, 114, 266, 138] as [number, number, number, number]),
  mockWriteTextFile: vi.fn(),
  mockReadTextFile: vi.fn(),
}));

vi.mock("@/lib/tauriInvoke", () => ({
  invokeLogged: mockInvokeLogged,
  AppInvokeError: class AppInvokeError extends Error {},
}));

vi.mock("@/lib/pdf/pdfStorage", () => ({
  writeTextFile: mockWriteTextFile,
  readTextFile: mockReadTextFile,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn().mockResolvedValue("C:\\export\\form-data.csv"),
  open: vi.fn().mockResolvedValue("C:\\import\\form-data.csv"),
}));

vi.mock("@/lib/pdf/pdfEngine", () => ({
  encodeBase64Pdf: (bytes: Uint8Array) => encodeBase64Pdf(bytes),
  decodeBase64Pdf: () => PDF_BYTES.slice(),
  loadPdfFromBytes: mockLoadPdf,
  viewportRectToPdfRect: mockViewportRect,
  collectFormFieldValuesFromPdf: vi.fn().mockResolvedValue({}),
}));

import { applyFormChanges, exportFormDataCsv, importFormDataCsv, inspectDocumentForms } from "./formService";

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
    mockWriteTextFile.mockResolvedValue(undefined);
    mockReadTextFile.mockResolvedValue('name,value,type\n"name","Jane","text"\n');
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
    useFormStore.getState().setValuesFromPdf({
      name: { name: "name", value: "Jane", type: "text", required: true },
    });
    useFormStore.getState().setFieldValue("name", "", "text");

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

  it("includes all dropdown options in create_form_fields payload", async () => {
    useFormStore.getState().addNewField({
      pageIndex: 0,
      name: "Color",
      kind: "dropdown",
      x: 41,
      y: 100,
      width: 160,
      height: 24,
      defaultValue: "Red",
      required: false,
      readOnly: false,
      options: ["Red", "Green", "Blue"],
    });
    useFormStore.getState().setFieldValue("Color", "Red", "dropdown");

    const ok = await applyFormChanges();
    expect(ok).toBe(true);
    const call = mockInvokeLogged.mock.calls.find(([cmd]) => cmd === "create_form_fields");
    expect(call).toBeDefined();
    const payload = JSON.parse((call?.[1] as { fieldsJson: string }).fieldsJson) as Array<{
      options?: string[];
    }>;
    expect(payload[0]?.options).toEqual(["Red", "Green", "Blue"]);
  });

  it("invokes apply_form_values only for changed values", async () => {
    useFormStore.getState().setValuesFromPdf({
      existing: { name: "existing", value: "hello", type: "text" },
    });
    useFormStore.getState().setFieldValue("existing", "changed", "text");

    const ok = await applyFormChanges();
    expect(ok).toBe(true);
    expect(mockInvokeLogged).toHaveBeenCalledWith(
      "apply_form_values",
      expect.objectContaining({
        valuesJson: expect.stringContaining("changed"),
      }),
    );
  });

  it("skips apply_form_values when values match baseline", async () => {
    useFormStore.getState().setValuesFromPdf({
      existing: { name: "existing", value: "hello", type: "text" },
    });

    const ok = await applyFormChanges();
    expect(ok).toBe(true);
    expect(mockInvokeLogged).not.toHaveBeenCalled();
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

  it("exports form data as CSV via text file writer", async () => {
    useFormStore.getState().setFieldValue("name", "Jane", "text");
    await exportFormDataCsv();
    expect(mockWriteTextFile).toHaveBeenCalledWith(
      "C:\\export\\form-data.csv",
      expect.stringContaining('"name","Jane","text"'),
    );
    expect(mockInvokeLogged).not.toHaveBeenCalledWith("write_pdf_file", expect.anything());
  });

  it("imports form data from CSV via text file reader", async () => {
    await importFormDataCsv();
    expect(mockReadTextFile).toHaveBeenCalledWith("C:\\import\\form-data.csv");
    expect(useFormStore.getState().values.name?.value).toBe("Jane");
  });
});
