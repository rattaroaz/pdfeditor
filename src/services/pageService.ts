import { invokeLogged } from "@/lib/tauriInvoke";
import { decodeBase64Pdf, encodeBase64Pdf, loadPdfFromBytes } from "@/lib/pdf/pdfEngine";
import type { PdfBytesResult } from "@/lib/pdf/pdfBinary";
import {
  remapAnnotationsAfterDelete,
  remapAnnotationsAfterInsert,
  remapAnnotationsAfterReorder,
  remapPageIndexedAfterDelete,
  remapPageIndexedAfterInsert,
  remapPageIndexedAfterReorder,
} from "@/lib/pageAnnotationRemap";
import { getDocumentLoadPassword, useDocumentStore } from "@/stores/documentStore";
import { useAnnotationStore } from "@/stores/annotationStore";
import { useContentEditStore } from "@/stores/contentEditStore";
import { useFormStore } from "@/stores/formStore";
import { recordHistory } from "@/stores/historyStore";
import { createErrorReporter, log } from "@/lib/logging";
import type {
  Annotation,
  FormFieldDefinition,
  ImageContentEdit,
  TextContentEdit,
} from "@shared/types";

/** Per-page state that must be remapped when pages are added, removed, or reordered. */
interface PageIndexedState {
  annotations: Annotation[];
  textEdits: TextContentEdit[];
  imageEdits: ImageContentEdit[];
  newFields: FormFieldDefinition[];
}

const showError = createErrorReporter("document", "page");

function remapAllPageIndexedState(remap: PageIndexedState): void {
  useAnnotationStore.getState().setAnnotations(remap.annotations);
  useContentEditStore.setState({
    textEdits: remap.textEdits,
    imageEdits: remap.imageEdits,
  });
  useFormStore.setState({ newFields: remap.newFields });
}

async function applyPdfMutation(
  mutate: (base64: string) => Promise<PdfBytesResult>,
  remap?: (state: PageIndexedState) => PageIndexedState,
): Promise<void> {
  const docStore = useDocumentStore.getState();
  const annStore = useAnnotationStore.getState();
  const contentStore = useContentEditStore.getState();
  const formStore = useFormStore.getState();
  const sourceBytes = docStore.basePdfBytes ?? docStore.pdfBytes;

  if (!sourceBytes) {
    throw new Error("No document open");
  }

  recordHistory();

  docStore.setLoading(true);
  try {
    const result = await mutate(encodeBase64Pdf(sourceBytes));
    const newBytes = decodeBase64Pdf(result.dataBase64);
    const pdfDoc = await loadPdfFromBytes(newBytes, getDocumentLoadPassword());

    docStore.applyPdfStructureChange({
      pdfDoc,
      pdfBytes: newBytes,
      pageCount: pdfDoc.numPages,
    });

    if (remap) {
      remapAllPageIndexedState(
        remap({
          annotations: annStore.annotations,
          textEdits: contentStore.textEdits,
          imageEdits: contentStore.imageEdits,
          newFields: formStore.newFields,
        }),
      );
    }

    log.document.info("Page mutation applied", {
      userAction: "page_edit",
      pageCount: pdfDoc.numPages,
    });
  } catch (err) {
    showError(err);
    throw err;
  } finally {
    docStore.setLoading(false);
  }
}

export async function deletePages(pageNumbers: number[]): Promise<void> {
  if (pageNumbers.length === 0) return;
  const sorted = [...pageNumbers].sort((a, b) => a - b);
  log.document.info("Deleting pages", {
    userAction: "delete_pages",
    metadata: { pageNumbers: sorted },
  });

  await applyPdfMutation(
    (pdfBase64) =>
      invokeLogged<PdfBytesResult>("delete_pdf_pages", {
        pdfBase64,
        pageNumbers: sorted,
      }),
    ({ annotations, textEdits, imageEdits, newFields }) => ({
      annotations: remapAnnotationsAfterDelete(annotations, sorted),
      textEdits: remapPageIndexedAfterDelete(textEdits, sorted),
      imageEdits: remapPageIndexedAfterDelete(imageEdits, sorted),
      newFields: remapPageIndexedAfterDelete(newFields, sorted),
    }),
  );
}

export async function insertBlankPages(afterPage: number, count = 1): Promise<void> {
  await applyPdfMutation(
    (pdfBase64) =>
      invokeLogged<PdfBytesResult>("insert_blank_pages", {
        pdfBase64,
        afterPage,
        count,
      }),
    ({ annotations, textEdits, imageEdits, newFields }) => ({
      annotations: remapAnnotationsAfterInsert(annotations, afterPage, count),
      textEdits: remapPageIndexedAfterInsert(textEdits, afterPage, count),
      imageEdits: remapPageIndexedAfterInsert(imageEdits, afterPage, count),
      newFields: remapPageIndexedAfterInsert(newFields, afterPage, count),
    }),
  );
}

export async function reorderPages(newOrder: number[]): Promise<void> {
  await applyPdfMutation(
    (pdfBase64) =>
      invokeLogged<PdfBytesResult>("reorder_pdf_pages", {
        pdfBase64,
        newOrder,
      }),
    ({ annotations, textEdits, imageEdits, newFields }) => ({
      annotations: remapAnnotationsAfterReorder(annotations, newOrder),
      textEdits: remapPageIndexedAfterReorder(textEdits, newOrder),
      imageEdits: remapPageIndexedAfterReorder(imageEdits, newOrder),
      newFields: remapPageIndexedAfterReorder(newFields, newOrder),
    }),
  );
}
