import { open, save } from "@tauri-apps/plugin-dialog";
import { invokeLogged } from "@/lib/tauriInvoke";
import {
  collectFormFieldValuesFromPdf,
  decodeBase64Pdf,
  encodeBase64Pdf,
  loadPdfFromBytes,
  viewportRectToPdfRect,
} from "@/lib/pdf/pdfEngine";
import type { PdfBytesResult } from "@/lib/pdf/pdfBinary";
import { readTextFile, writeTextFile } from "@/lib/pdf/pdfStorage";
import { runDocumentOperation } from "@/services/documentOpQueue";
import { getDocumentLoadPassword, useDocumentStore } from "@/stores/documentStore";
import { useFormStore } from "@/stores/formStore";
import { createErrorReporter, log } from "@/lib/logging";
import { defaultDropdownOptions, normalizeDropdownOptions } from "@/lib/dropdownOptions";
import type { FormFieldDefinition, FormFieldValue, FormInfo } from "@shared/types";
import type { PdfDocument } from "@/lib/pdf/pdfEngine";

const showError = createErrorReporter("form", "form");

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
  if (fieldObjects && Object.keys(fieldObjects).length > 0) {
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
    useFormStore.getState().setValuesFromPdf(values);
    return;
  }

  const fromAnnotations = await collectFormFieldValuesFromPdf(pdfDoc);
  const values: Record<string, FormFieldValue> = {};
  for (const entry of Object.values(fromAnnotations)) {
    values[entry.name] = {
      name: entry.name,
      value: entry.value,
      type: mapFieldType(entry.type),
      required: entry.required,
    };
  }
  useFormStore.getState().setValuesFromPdf(values);
}

function mapFieldType(type?: string): FormFieldDefinition["kind"] {
  switch (type) {
    case "checkbox":
      return "checkbox";
    case "radiobutton":
    case "radio":
      return "radio";
    case "combobox":
    case "dropdown":
      return "dropdown";
    case "listbox":
      return "listbox";
    default:
      return "text";
  }
}

export async function applyFormChanges(): Promise<boolean> {
  return runDocumentOperation("apply_form_changes", async () => {
  const docStore = useDocumentStore.getState();
  const sourceBytes = docStore.basePdfBytes ?? docStore.pdfBytes;
  if (!sourceBytes) return true;

  const pendingFields = useFormStore.getState().newFields;
  if (!useFormStore.getState().hasPendingFormChanges()) return true;

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
            options:
              f.kind === "dropdown"
                ? normalizeDropdownOptions(f.options ?? defaultDropdownOptions(2))
                : undefined,
          };
        }),
      );

      const createResult = await invokeLogged<PdfBytesResult>("create_form_fields", {
        pdfBase64: base64,
        fieldsJson: JSON.stringify(fieldsPayload),
      });
      base64 = createResult.dataBase64;
    }

    const changedValues = useFormStore.getState().getChangedValuesArray();
    if (changedValues.length > 0) {
      const valueResult = await invokeLogged<PdfBytesResult>("apply_form_values", {
        pdfBase64: base64,
        valuesJson: JSON.stringify(
          changedValues.map((v) => ({ name: v.name, value: v.value, type: v.type })),
        ),
      });
      base64 = valueResult.dataBase64;
    }

    const newBytes = decodeBase64Pdf(base64);
    const pdfDoc = await loadPdfFromBytes(newBytes, getDocumentLoadPassword());
    docStore.applyPdfStructureChange({ pdfDoc, pdfBytes: newBytes, pageCount: pdfDoc.numPages });

    useFormStore.setState({ newFields: [] });
    await inspectDocumentForms(newBytes);
    await loadFormFieldsFromPdf(pdfDoc);
    log.form.info("Form changes applied", { userAction: "form_save" });
    return true;
  } catch (err) {
    showError(err);
    return false;
  } finally {
    docStore.setLoading(false);
  }
  });
}

export async function flattenForms(): Promise<void> {
  return runDocumentOperation("flatten_forms", async () => {
  const docStore = useDocumentStore.getState();
  const sourceBytes = docStore.basePdfBytes ?? docStore.pdfBytes;
  if (!sourceBytes) return;

  log.form.info("Flattening form fields", { userAction: "flatten_forms" });
  docStore.setLoading(true);
  try {
    const result = await invokeLogged<PdfBytesResult>("flatten_pdf_forms", {
      pdfBase64: encodeBase64Pdf(sourceBytes),
    });
    const newBytes = decodeBase64Pdf(result.dataBase64);
    const pdfDoc = await loadPdfFromBytes(newBytes, getDocumentLoadPassword());
    docStore.applyPdfStructureChange({ pdfDoc, pdfBytes: newBytes, pageCount: pdfDoc.numPages });
    useFormStore.getState().clearFormState();
    docStore.setStatusMessage("Form flattened");
  } catch (err) {
    showError(err);
  } finally {
    docStore.setLoading(false);
  }
  });
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
  await writeTextFile(path, header + rows);
  log.form.info("Form data exported to CSV", {
    userAction: "export_form_csv",
    metadata: { path, fieldCount: values.length },
  });
  useDocumentStore.getState().setStatusMessage("Form data exported");
}

export async function importFormDataCsv(): Promise<void> {
  const selected = await open({
    multiple: false,
    filters: [{ name: "CSV", extensions: ["csv", "txt"] }],
  });
  if (!selected || Array.isArray(selected)) return;

  const text = await readTextFile(selected);
  const formStore = useFormStore.getState();

  for (const line of text.split(/\r?\n/).slice(1)) {
    const match = line.match(/^"([^"]*)","([^"]*)","([^"]*)"/);
    if (match) {
      formStore.setFieldValue(match[1], match[2], mapFieldType(match[3]));
    }
  }
  log.form.info("Form data imported from CSV", { userAction: "import_form_csv", metadata: { path: selected } });
  useDocumentStore.getState().markDocumentChanged("forms");
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
  await writeTextFile(path, xfdf);
  log.form.info("Form data exported to XFDF", {
    userAction: "export_form_xfdf",
    metadata: { path, fieldCount: values.length },
  });
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
