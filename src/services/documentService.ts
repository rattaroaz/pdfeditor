import { errorMessage } from "@/lib/parseInvokeError";
import { ask, open, save } from "@tauri-apps/plugin-dialog";
import { flushSync } from "react-dom";
import { invokeLogged } from "@/lib/tauriInvoke";
import { createCorrelationId, createErrorReporter, log, startTimer } from "@/lib/logging";
import { loadPdfFromBytes, decodeBase64Pdf, PdfPasswordRequiredError, documentHasExtractableText } from "@/lib/pdf/pdfEngine";
import {
  ensurePdfExtension,
  encodeBase64Pdf,
  fileNameFromPath,
  type PdfBytesResult,
} from "@/lib/pdf/pdfBinary";
import { writePdfBytes } from "@/lib/pdf/pdfStorage";
import { APP_NAME } from "@/lib/constants";
import { useDocumentStore } from "@/stores/documentStore";
import { useAnnotationStore } from "@/stores/annotationStore";
import { useUiStore } from "@/stores/uiStore";
import { useContentEditStore } from "@/stores/contentEditStore";
import { useFormStore } from "@/stores/formStore";
import { clearHistory } from "@/stores/historyStore";
import type { Annotation, PdfMetadata, ReadFileResult } from "@shared/types";
import { applyContentEdits } from "@/services/contentEditService";
import { applyFormChanges, inspectDocumentForms, loadFormFieldsFromPdf } from "@/services/formService";
import { applySecurityOnSaveBytes, inspectPdfSecurity, type PdfSecurityInfo } from "@/services/securityService";

interface SavePdfResult extends PdfBytesResult {
  path: string;
}

interface PdfInfoResponse {
  metadata: PdfMetadata;
}

const showError = createErrorReporter("document", "document");

async function readPdfBytes(filePath: string): Promise<Uint8Array> {
  const result = await invokeLogged<ReadFileResult>("read_pdf_file", {
    path: filePath,
  });
  return decodeBase64Pdf(result.dataBase64);
}

async function fetchMetadata(
  filePath: string,
  pageCount: number,
  fileSize: number,
): Promise<PdfMetadata> {
  try {
    const info = await invokeLogged<PdfInfoResponse>("get_pdf_info", { path: filePath });
    return { ...info.metadata, pageCount };
  } catch {
    log.document.warn("get_pdf_info failed, using pdf.js metadata", {
      userAction: "open",
    });
    return { pageCount, fileSize };
  }
}

export async function openPdfFromDialog(): Promise<void> {
  const selected = await open({
    multiple: false,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (!selected || Array.isArray(selected)) return;
  await openPdfFromPath(selected);
}

async function loadPdfWithPasswordPrompt(
  bytes: Uint8Array,
): Promise<{ pdfDoc: Awaited<ReturnType<typeof loadPdfFromBytes>>; password?: string }> {
  let password: string | undefined;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const pdfDoc = await loadPdfFromBytes(bytes, password);
      return { pdfDoc, password };
    } catch (err) {
      if (err instanceof PdfPasswordRequiredError) {
        const entered = window.prompt(
          err.incorrect
            ? "Incorrect password. Try again:"
            : "This PDF is password protected. Enter the password to open it:",
        );
        if (!entered) throw new Error("Open cancelled — password required");
        password = entered;
        continue;
      }
      throw err;
    }
  }
  throw new Error("Too many password attempts");
}

export async function openPdfFromPath(filePath: string): Promise<void> {
  const docStore = useDocumentStore.getState();
  const annStore = useAnnotationStore.getState();

  docStore.setLoading(true);
  docStore.setLoadError(null);
  docStore.setStatusMessage(null);

  try {
    const pdfBytes = await readPdfBytes(filePath);
    if (pdfBytes.byteLength < 5 || pdfBytes[0] !== 0x25) {
      throw new Error("File does not appear to be a valid PDF");
    }

    let sidecarJson: string | null = null;
    try {
      sidecarJson = await invokeLogged<string | null>("load_annotations", {
        filePath,
      });
    } catch {
      sidecarJson = null;
    }

    const cleanBase64 = await invokeLogged<string>("prepare_document_bytes", {
      pdfBase64: encodeBase64Pdf(pdfBytes),
      hasSidecar: !!sidecarJson,
    });
    const baseBytes = decodeBase64Pdf(cleanBase64);
    const viewBytes = sidecarJson ? baseBytes : pdfBytes;

    let security: PdfSecurityInfo = { isEncrypted: false, requiresPassword: false };
    try {
      security = await inspectPdfSecurity(pdfBytes);
    } catch {
      log.document.warn("Security inspection failed, assuming document is not protected", {
        userAction: "open",
      });
    }
    const { pdfDoc, password } = await loadPdfWithPasswordPrompt(viewBytes);
    const fileName = fileNameFromPath(filePath);
    const metadata = await fetchMetadata(filePath, pdfDoc.numPages, pdfBytes.byteLength);
    metadata.isPasswordProtected = security.isEncrypted;

    docStore.setDocument({
      filePath,
      fileName,
      pdfDoc,
      pdfBytes: viewBytes,
      metadata,
    });
    const openedDocId = useDocumentStore.getState().documentId;
    void documentHasExtractableText(pdfDoc).then((hasText) => {
      if (useDocumentStore.getState().documentId === openedDocId) {
        useDocumentStore.getState().setHasExtractableText(hasText);
      }
    });
    useDocumentStore.setState({
      basePdfBytes: baseBytes.slice(),
      documentPassword: password ?? null,
      isPasswordProtected: security.isEncrypted,
    });

    try {
      await invokeLogged("add_recent_file", { path: filePath });
    } catch {
      log.document.warn("Failed to update recent files", { userAction: "open" });
    }

    if (sidecarJson) {
      annStore.setAnnotations(JSON.parse(sidecarJson) as Annotation[]);
    } else {
      annStore.clearAnnotations();
    }

    useContentEditStore.getState().clearEdits();
    useFormStore.getState().clearFormState();
    clearHistory();
    try {
      await inspectDocumentForms(baseBytes);
      await loadFormFieldsFromPdf(pdfDoc);
    } catch {
      log.document.warn("Form inspection failed", { userAction: "open" });
    }

    log.document.info("Document opened", {
      documentId: useDocumentStore.getState().documentId ?? undefined,
      userAction: "open",
    });
  } catch (err) {
    const message = errorMessage(err);
    showError(err);
    docStore.setLoadError(message);
    log.document.error("Open failed", { userAction: "open" });
  } finally {
    docStore.setLoading(false);
  }
}

export async function savePdf(saveAs = false): Promise<void> {
  const correlationId = createCorrelationId();
  const timer = startTimer(log.document, "save_pdf", { userAction: "save", correlationId });
  const docStore = useDocumentStore.getState();
  const { filePath, pdfBytes, fileName } = docStore;

  if (!pdfBytes || !docStore.pdfDoc) {
    showError(new Error("No document open to save"), "save");
    return;
  }

  let targetPath = filePath;
  if (!targetPath || saveAs) {
    const selected = await save({
      defaultPath: fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!selected) return;
    targetPath = ensurePdfExtension(selected);
  }

  docStore.setStatusMessage("Saving…");

  try {
    if (useUiStore.getState().appMode === "edit") {
      flushSync(() => {
        useUiStore.getState().setAppMode("document");
      });
    }
    useContentEditStore.getState().finalizeTextEdits();

    if (useContentEditStore.getState().hasEdits()) {
      log.document.info("Applying content edits before save", { userAction: "save" });
      const ok = await applyContentEdits({ clearAfter: false });
      if (!ok) {
        docStore.setStatusMessage(null);
        return;
      }
    }

    const formStore = useFormStore.getState();
    if (formStore.hasPendingFormChanges()) {
      log.document.info("Applying form changes before save", {
        userAction: "save",
        metadata: {
          newFields: formStore.newFields.length > 0,
          changedValues: formStore.getChangedValuesArray().length,
        },
      });
      const ok = await applyFormChanges();
      if (!ok) {
        docStore.setStatusMessage(null);
        return;
      }
    }

    const sourceBytes =
      useDocumentStore.getState().pdfBytes ??
      useDocumentStore.getState().basePdfBytes ??
      pdfBytes;
    const result = await invokeLogged<SavePdfResult>("save_pdf_with_annotations", {
      targetPath,
      pdfBase64: encodeBase64Pdf(sourceBytes),
      annotationsJson: JSON.stringify(useAnnotationStore.getState().annotations),
    });

    let newBytes = decodeBase64Pdf(result.dataBase64);

    const securityStore = useDocumentStore.getState();
    if (securityStore.pendingSavePassword || securityStore.removePasswordOnSave) {
      newBytes = await applySecurityOnSaveBytes(newBytes);
    }
    await writePdfBytes(targetPath, newBytes);

    const updatedDoc = useDocumentStore.getState();
    const reloadPassword = useDocumentStore.getState().documentPassword ?? undefined;
    const reloadedDoc = await loadPdfFromBytes(newBytes, reloadPassword);

    docStore.applySavedDocument({
      filePath: targetPath,
      pdfDoc: reloadedDoc,
      pdfBytes: newBytes,
    });
    useDocumentStore.setState({
      basePdfBytes: newBytes.slice(),
      savedPdfBytes: newBytes.slice(),
      metadata: updatedDoc.metadata
        ? {
            ...updatedDoc.metadata,
            isPasswordProtected: useDocumentStore.getState().isPasswordProtected,
            fileSize: newBytes.byteLength,
          }
        : updatedDoc.metadata,
    });

    try {
      await inspectDocumentForms(newBytes);
      await loadFormFieldsFromPdf(reloadedDoc);
      useFormStore.setState({ newFields: [] });
    } catch {
      log.document.warn("Form reload after save failed", { userAction: "save" });
    }

    useContentEditStore.getState().clearEdits();

    const flatten = useUiStore.getState().flattenOnSave;
    const savedAnnotations = useAnnotationStore.getState().annotations;
    if (flatten) {
      useAnnotationStore.getState().clearAnnotations();
      try {
        await invokeLogged("save_annotations", {
          filePath: targetPath,
          json: "[]",
        });
      } catch {
        // sidecar optional when flattened
      }
    } else {
      try {
        await invokeLogged("save_annotations", {
          filePath: targetPath,
          json: JSON.stringify(savedAnnotations),
        });
      } catch {
        log.document.warn("Annotation sidecar save failed", { userAction: "save" });
      }
    }

    timer.end("Document saved with embedded annotations", {
      metadata: { path: targetPath },
    });
  } catch (err) {
    docStore.setStatusMessage(null);
    timer.fail(err);
    showError(err, "save");
    throw err;
  }
}

export async function persistAnnotations(): Promise<void> {
  const { filePath } = useDocumentStore.getState();
  const { annotations } = useAnnotationStore.getState();
  if (!filePath) return;

  try {
    await invokeLogged("save_annotations", {
      filePath,
      json: JSON.stringify(annotations),
    });
    useDocumentStore.getState().setDirty(true);
  } catch (err) {
    showError(err);
  }
}

export async function closeDocument(): Promise<void> {
  const docStore = useDocumentStore.getState();
  if (!docStore.pdfDoc) return;

  if (docStore.isDirty) {
    const discard = await ask(
      "You have unsaved changes. Close without saving?",
      { title: APP_NAME, kind: "warning" },
    );
    if (!discard) return;
  }

  useAnnotationStore.getState().clearAnnotations();
  useContentEditStore.getState().clearEdits();
  useFormStore.getState().clearFormState();
  clearHistory();
  useUiStore.setState({
    showSearch: false,
    searchQuery: "",
    searchMatches: [],
    activeMatchIndex: 0,
  });
  log.document.info("Closing document", {
    userAction: "close",
    metadata: { filePath: docStore.filePath, wasDirty: docStore.isDirty },
  });
  docStore.clearDocument();
}

export async function revertToSaved(): Promise<void> {
  const docStore = useDocumentStore.getState();
  const annStore = useAnnotationStore.getState();
  const { savedPdfBytes, filePath } = docStore;

  if (!savedPdfBytes || !filePath) {
    showError(new Error("No saved version to revert to"));
    return;
  }

  docStore.setLoading(true);
  try {
    const reloadPassword = docStore.documentPassword ?? undefined;
    const pdfDoc = await loadPdfFromBytes(savedPdfBytes, reloadPassword);
    const fileName = fileNameFromPath(filePath);
    const metadata = await fetchMetadata(
      filePath,
      pdfDoc.numPages,
      savedPdfBytes.byteLength,
    );

    docStore.setDocument({
      filePath,
      fileName,
      pdfDoc,
      pdfBytes: savedPdfBytes.slice(),
      metadata,
    });
    const openedDocId = useDocumentStore.getState().documentId;
    void documentHasExtractableText(pdfDoc).then((hasText) => {
      if (useDocumentStore.getState().documentId === openedDocId) {
        useDocumentStore.getState().setHasExtractableText(hasText);
      }
    });

    try {
      const saved = await invokeLogged<string | null>("load_annotations", {
        filePath,
      });
      if (saved) {
        annStore.setAnnotations(JSON.parse(saved) as Annotation[]);
      } else {
        annStore.clearAnnotations();
      }
    } catch {
      annStore.clearAnnotations();
    }

    useContentEditStore.getState().clearEdits();
    useFormStore.getState().clearFormState();
    clearHistory();
    try {
      const bytes = useDocumentStore.getState().savedPdfBytes ?? savedPdfBytes;
      if (bytes) {
        await inspectDocumentForms(bytes);
        await loadFormFieldsFromPdf(pdfDoc);
      }
    } catch {
      // forms optional on revert
    }

    log.document.info("Document reverted to saved", { userAction: "revert" });
  } catch (err) {
    log.document.error("Revert to saved failed", {
      userAction: "revert",
      metadata: { filePath, error: String(err) },
    });
    showError(err);
  } finally {
    docStore.setLoading(false);
  }
}
