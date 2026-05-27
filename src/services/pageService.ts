import { invokeLogged } from "@/lib/tauriInvoke";
import { decodeBase64Pdf, encodeBase64Pdf, loadPdfFromBytes } from "@/lib/pdf/pdfEngine";
import {
  remapAnnotationsAfterDelete,
  remapAnnotationsAfterInsert,
  remapAnnotationsAfterReorder,
} from "@/lib/pageAnnotationRemap";
import { useDocumentStore } from "@/stores/documentStore";
import { useAnnotationStore } from "@/stores/annotationStore";
import { useUiStore } from "@/stores/uiStore";
import { errorMessage } from "@/lib/parseInvokeError";
import { log } from "@/lib/logging";

interface PdfBytesResult {
  dataBase64: string;
}

function showError(err: unknown): void {
  useUiStore.getState().showError({
    errorId: crypto.randomUUID(),
    message: errorMessage(err),
  });
}

async function applyPdfMutation(
  mutate: (base64: string) => Promise<PdfBytesResult>,
  remapAnnotations?: (
    annotations: ReturnType<typeof useAnnotationStore.getState>["annotations"],
  ) => ReturnType<typeof useAnnotationStore.getState>["annotations"],
): Promise<void> {
  const docStore = useDocumentStore.getState();
  const annStore = useAnnotationStore.getState();
  const sourceBytes = docStore.basePdfBytes ?? docStore.pdfBytes;

  if (!sourceBytes) {
    throw new Error("No document open");
  }

  docStore.setLoading(true);
  try {
    const result = await mutate(encodeBase64Pdf(sourceBytes));
    const newBytes = decodeBase64Pdf(result.dataBase64);
    const pdfDoc = await loadPdfFromBytes(newBytes);

    docStore.applyPdfStructureChange({
      pdfDoc,
      pdfBytes: newBytes,
      pageCount: pdfDoc.numPages,
    });

    if (remapAnnotations) {
      annStore.setAnnotations(remapAnnotations(annStore.annotations));
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

  await applyPdfMutation(
    (pdfBase64) =>
      invokeLogged<PdfBytesResult>("delete_pdf_pages", {
        pdfBase64,
        pageNumbers: sorted,
      }),
    (annotations) => remapAnnotationsAfterDelete(annotations, sorted),
  );
}

export async function rotatePagesPermanent(
  pageNumbers: number[],
  degrees: 90 | 180 | 270 | -90,
): Promise<void> {
  if (pageNumbers.length === 0) return;

  await applyPdfMutation((pdfBase64) =>
    invokeLogged<PdfBytesResult>("rotate_pdf_pages", {
      pdfBase64,
      pageNumbers,
      degrees,
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
    (annotations) => remapAnnotationsAfterInsert(annotations, afterPage, count),
  );
}

export async function reorderPages(newOrder: number[]): Promise<void> {
  await applyPdfMutation(
    (pdfBase64) =>
      invokeLogged<PdfBytesResult>("reorder_pdf_pages", {
        pdfBase64,
        newOrder,
      }),
    (annotations) => remapAnnotationsAfterReorder(annotations, newOrder),
  );
}
