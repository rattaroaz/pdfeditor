import { open, save } from "@tauri-apps/plugin-dialog";
import { invokeLogged } from "@/lib/tauriInvoke";
import {
  decodeBase64Pdf,
  encodeBase64Pdf,
  loadPdfFromBytes,
  viewportRectToPdfRect,
} from "@/lib/pdf/pdfEngine";
import { useDocumentStore } from "@/stores/documentStore";
import { useFormStore } from "@/stores/formStore";
import { useUiStore } from "@/stores/uiStore";
import { errorMessage } from "@/lib/parseInvokeError";
import { logger } from "@/lib/logger";
import type { FormFieldDefinition, FormFieldValue, FormInfo } from "@shared/types";
import type { PdfDocument } from "@/lib/pdf/pdfEngine";

interface PdfBytesResult {
  dataBase64: string;
}

function showError(err: unknown): void {
  useUiStore.getState().showError({
    errorId: crypto.randomUUID(),
    message: errorMessage(err),
  });
}

export async function inspectDocumentForms(pdfBytes: Uint8Array): Promise<FormInfo> {
  const info = await invokeLogged<FormInfo>("inspect_pdf_forms", {
    pdfBase64: encodeBase64Pdf(pdfBytes),
  });
  useFormStore.getState().setFormInfo(info);
  return info;
}

export async function loadFormFieldsFromPdf(pdfDoc: PdfDocument): Promise<void> {
  const formStore = useFormStore.getState();

  if (pdfDoc.isPureXfa) {
    formStore.setFormInfo({ hasAcroform: false, hasXfa: true, fieldCount: 0 });
    return;
  }

  const fieldObjects = await pdfDoc.getFieldObjects();
  if (!fieldObjects) {
    useFormStore.setState({ values: {} });
    return;
  }

  const values: Record<string, FormFieldValue> = {};
  for (const [name, objs] of Object.entries(fieldObjects)) {
    const first = objs[0] as { type?: string; value?: string; required?: boolean };
    const kind = mapFieldType(first?.type);
    values[name] = {
      name,
      value: first?.value ?? "",
      type: kind,
      required: !!first?.required,
    };
  }
  useFormStore.setState({ values });
}

function mapFieldType(type?: string): FormFieldDefinition["kind"] {
  switch (type) {
    case "checkbox":
      return "checkbox";
    case "radiobutton":
      return "radio";
    case "combobox":
      return "dropdown";
    case "listbox":
      return "listbox";
    default:
      return "text";
  }
}

export async function applyFormChanges(): Promise<boolean> {
  const docStore = useDocumentStore.getState();
  const sourceBytes = docStore.basePdfBytes ?? docStore.pdfBytes;
  if (!sourceBytes) return true;

  const pendingFields = useFormStore.getState().newFields;
  const values = useFormStore.getState().getValuesArray();
  if (pendingFields.length === 0 && values.length === 0) return true;

  if (!useFormStore.getState().validateRequired()) {
    showError(new Error("Please fill all required form fields."));
    return false;
  }

  docStore.setLoading(true);
  try {
    let base64 = encodeBase64Pdf(sourceBytes);

    if (pendingFields.length > 0) {
      const pdfDoc = docStore.pdfDoc;
      const rotation = useDocumentStore.getState().rotation;
      if (!pdfDoc) {
        showError(new Error("No PDF document loaded"));
        return false;
      }

      const fieldsPayload = await Promise.all(
        pendingFields.map(async (f) => {
          const page = await pdfDoc.getPage(f.pageIndex + 1);
          const pdfRect = viewportRectToPdfRect(
            page,
            f.x,
            f.y,
            f.width,
            f.height,
            rotation,
          );
          return {
            pageIndex: f.pageIndex,
            name: f.name,
            type: f.kind,
            x: f.x,
            y: f.y,
            width: f.width,
            height: f.height,
            pdfRect,
            defaultValue: f.defaultValue ?? "",
            required: f.required ?? false,
            readOnly: f.readOnly ?? false,
          };
        }),
      );

      const createResult = await invokeLogged<PdfBytesResult>("create_form_fields", {
        pdfBase64: base64,
        fieldsJson: JSON.stringify(fieldsPayload),
      });
      base64 = createResult.dataBase64;
    }

    if (values.length > 0) {
      const valueResult = await invokeLogged<PdfBytesResult>("apply_form_values", {
        pdfBase64: base64,
        valuesJson: JSON.stringify(values.map((v) => ({ name: v.name, value: v.value, type: v.type }))),
      });
      base64 = valueResult.dataBase64;
    }

    const newBytes = decodeBase64Pdf(base64);
    const pdfDoc = await loadPdfFromBytes(newBytes);
    docStore.applyPdfStructureChange({ pdfDoc, pdfBytes: newBytes, pageCount: pdfDoc.numPages });

    useFormStore.setState({ newFields: [] });
    await inspectDocumentForms(newBytes);
    await loadFormFieldsFromPdf(pdfDoc);
    logger.info("Form changes applied", { userAction: "form_save" });
    return true;
  } catch (err) {
    showError(err);
    return false;
  } finally {
    docStore.setLoading(false);
  }
}

export async function flattenForms(): Promise<void> {
  const docStore = useDocumentStore.getState();
  const sourceBytes = docStore.basePdfBytes ?? docStore.pdfBytes;
  if (!sourceBytes) return;

  docStore.setLoading(true);
  try {
    const result = await invokeLogged<PdfBytesResult>("flatten_pdf_forms", {
      pdfBase64: encodeBase64Pdf(sourceBytes),
    });
    const newBytes = decodeBase64Pdf(result.dataBase64);
    const pdfDoc = await loadPdfFromBytes(newBytes);
    docStore.applyPdfStructureChange({ pdfDoc, pdfBytes: newBytes, pageCount: pdfDoc.numPages });
    useFormStore.getState().clearFormState();
    docStore.setStatusMessage("Form flattened");
  } catch (err) {
    showError(err);
  } finally {
    docStore.setLoading(false);
  }
}

export async function exportFormDataCsv(): Promise<void> {
  const values = useFormStore.getState().getValuesArray();
  if (values.length === 0) {
    showError(new Error("No form data to export"));
    return;
  }

  const path = await save({
    defaultPath: "form-data.csv",
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  if (!path) return;

  const header = "name,value,type\n";
  const rows = values.map((v) => `"${v.name}","${v.value.replace(/"/g, '""')}","${v.type}"`).join("\n");
  await invokeLogged("write_pdf_file", { path, dataBase64: btoa(header + rows) });
  useDocumentStore.getState().setStatusMessage("Form data exported");
}

export async function importFormDataCsv(): Promise<void> {
  const selected = await open({
    multiple: false,
    filters: [{ name: "CSV", extensions: ["csv", "txt"] }],
  });
  if (!selected || Array.isArray(selected)) return;

  const result = await invokeLogged<{ dataBase64: string }>("read_pdf_file", { path: selected });
  const text = atob(result.dataBase64);
  const formStore = useFormStore.getState();

  for (const line of text.split(/\r?\n/).slice(1)) {
    const match = line.match(/^"([^"]*)","([^"]*)","([^"]*)"/);
    if (match) {
      formStore.setFieldValue(match[1], match[2], mapFieldType(match[3]));
    }
  }
  useDocumentStore.getState().setDirty(true);
}

export async function exportFormDataFdfFile(): Promise<void> {
  const values = useFormStore.getState().getValuesArray();
  const fields = values
    .map((v) => `<field name="${escapeXml(v.name)}"><value>${escapeXml(v.value)}</value></field>`)
    .join("");
  const xfdf = `<?xml version="1.0" encoding="UTF-8"?>\n<xfdf xmlns="http://ns.adobe.com/xfdf/" xml:space="preserve">\n<fields>${fields}</fields>\n</xfdf>`;

  const path = await save({
    defaultPath: "form-data.xfdf",
    filters: [{ name: "XFDF", extensions: ["xfdf", "xml"] }],
  });
  if (!path) return;
  await invokeLogged("write_pdf_file", { path, dataBase64: btoa(xfdf) });
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
