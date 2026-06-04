import { invokeLogged } from "@/lib/tauriInvoke";
import {
  decodeBase64Pdf,
  encodeBase64Pdf,
  loadPdfFromBytes,
  viewportRectToPdfRect,
} from "@/lib/pdf/pdfEngine";
import type { TextContentEdit } from "@shared/types";
import { useContentEditStore } from "@/stores/contentEditStore";
import { useDocumentStore } from "@/stores/documentStore";
import { log, reportError } from "@/lib/logging";
import { TEXT_COVER_H_PAD, TEXT_COVER_V_PAD } from "@/lib/textEditBox";

interface PdfBytesResult {
  dataBase64: string;
}

const COVER_PAD = TEXT_COVER_H_PAD;
const COVER_V_PAD = TEXT_COVER_V_PAD;

export async function textEditsPayload(edits: TextContentEdit[]) {
  const { pdfDoc, rotation } = useDocumentStore.getState();
  if (!pdfDoc) return [];

  const payload = [];
  for (const edit of edits) {
    const page = await pdfDoc.getPage(edit.pageIndex + 1);
    const pad = edit.coverOld ? COVER_PAD : 0;
    const vPad = edit.coverOld ? COVER_V_PAD : 0;
    const [pdfX1, pdfY1, pdfX2, pdfY2] = viewportRectToPdfRect(
      page,
      edit.x - pad,
      edit.y - vPad,
      edit.width + pad * 2,
      edit.height + vPad * 2,
      rotation,
    );

    payload.push({
      pageIndex: edit.pageIndex,
      x: edit.x,
      y: edit.y,
      width: edit.width,
      height: edit.height,
      pdfX1,
      pdfY1,
      pdfX2,
      pdfY2,
      newText: edit.newText,
      fontSize: edit.fontSize,
      color: edit.color,
      coverOld: edit.coverOld,
    });
  }
  return payload;
}

export async function applyContentEdits(): Promise<boolean> {
  const docStore = useDocumentStore.getState();
  const editStore = useContentEditStore.getState();
  const sourceBytes = docStore.basePdfBytes ?? docStore.pdfBytes;

  if (!sourceBytes || !editStore.hasEdits()) return true;

  docStore.setLoading(true);
  try {
    const textEdits = await textEditsPayload(editStore.textEdits);
    const result = await invokeLogged<PdfBytesResult>("apply_content_edits", {
      pdfBase64: encodeBase64Pdf(sourceBytes),
      textEditsJson: JSON.stringify(textEdits),
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
    log.content.info("Content edits applied", { userAction: "content_edit" });
    return true;
  } catch (err) {
    reportError(err, { category: "content", userAction: "content_edit" });
    return false;
  } finally {
    docStore.setLoading(false);
  }
}
