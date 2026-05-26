import { invokeLogged } from "@/lib/tauriInvoke";
import { decodeBase64Pdf, encodeBase64Pdf, loadPdfFromBytes } from "@/lib/pdf/pdfEngine";
import { useContentEditStore } from "@/stores/contentEditStore";
import { useDocumentStore } from "@/stores/documentStore";
import { useUiStore } from "@/stores/uiStore";
import { errorMessage } from "@/lib/parseInvokeError";
import { logger } from "@/lib/logger";

interface PdfBytesResult {
  dataBase64: string;
}

export async function applyContentEdits(): Promise<boolean> {
  const docStore = useDocumentStore.getState();
  const editStore = useContentEditStore.getState();
  const sourceBytes = docStore.basePdfBytes ?? docStore.pdfBytes;

  if (!sourceBytes || !editStore.hasEdits()) return true;

  docStore.setLoading(true);
  try {
    const result = await invokeLogged<PdfBytesResult>("apply_content_edits", {
      pdfBase64: encodeBase64Pdf(sourceBytes),
      textEditsJson: JSON.stringify(
        editStore.textEdits.map((e) => ({
          pageIndex: e.pageIndex,
          x: e.x,
          y: e.y,
          width: e.width,
          height: e.height,
          newText: e.newText,
          fontSize: e.fontSize,
          color: e.color,
          coverOld: e.coverOld,
        })),
      ),
      imageEditsJson: JSON.stringify(
        editStore.imageEdits.map((e) => ({
          pageIndex: e.pageIndex,
          x: e.x,
          y: e.y,
          width: e.width,
          height: e.height,
          imageBase64: e.imageBase64,
          mimeType: e.mimeType,
        })),
      ),
    });

    const newBytes = decodeBase64Pdf(result.dataBase64);
    const pdfDoc = await loadPdfFromBytes(newBytes);
    docStore.applyPdfStructureChange({
      pdfDoc,
      pdfBytes: newBytes,
      pageCount: pdfDoc.numPages,
    });
    editStore.clearEdits();
    logger.info("Content edits applied", { userAction: "content_edit" });
    return true;
  } catch (err) {
    useUiStore.getState().showError({
      errorId: crypto.randomUUID(),
      message: errorMessage(err),
    });
    return false;
  } finally {
    docStore.setLoading(false);
  }
}
