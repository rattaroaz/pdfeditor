import { invokeLogged } from "@/lib/tauriInvoke";
import {
  decodeBase64Pdf,
  encodeBase64Pdf,
  loadPdfFromBytes,
  viewportRectToPdfRect,
} from "@/lib/pdf/pdfEngine";
import type { PdfBytesResult } from "@/lib/pdf/pdfBinary";
import type { ImageContentEdit, TextContentEdit } from "@shared/types";
import { useContentEditStore } from "@/stores/contentEditStore";
import { getDocumentLoadPassword, useDocumentStore } from "@/stores/documentStore";
import { log, reportError } from "@/lib/logging";
import { TEXT_COVER_H_PAD, TEXT_COVER_V_PAD } from "@/lib/textEditBox";

async function textEditsPayload(edits: TextContentEdit[]) {
  const { pdfDoc, rotation } = useDocumentStore.getState();
  if (!pdfDoc) return [];

  const payload = [];
  for (const edit of edits) {
    if (!edit.coverOld && !edit.newText.trim()) continue;
    const page = await pdfDoc.getPage(edit.pageIndex + 1);
    const pad = edit.coverOld ? TEXT_COVER_H_PAD : 0;
    const vPad = edit.coverOld ? TEXT_COVER_V_PAD : 0;
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
      newText: edit.newText.trim(),
      fontSize: edit.fontSize,
      color: edit.color,
      coverOld: edit.coverOld,
    });
  }
  return payload;
}

async function imageEditsPayload(edits: ImageContentEdit[]) {
  const { pdfDoc, rotation } = useDocumentStore.getState();
  if (!pdfDoc) return [];

  const payload = [];
  for (const edit of edits) {
    const page = await pdfDoc.getPage(edit.pageIndex + 1);
    const [pdfX1, pdfY1, pdfX2, pdfY2] = viewportRectToPdfRect(
      page,
      edit.x,
      edit.y,
      edit.width,
      edit.height,
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
      imageBase64: edit.imageBase64,
      mimeType: edit.mimeType,
    });
  }
  return payload;
}

export type ApplyContentEditsOptions = {
  /** Clear the edit store after a successful apply (default true). */
  clearAfter?: boolean;
};

export async function applyContentEdits(
  options: ApplyContentEditsOptions = {},
): Promise<boolean> {
  const { clearAfter = true } = options;
  const docStore = useDocumentStore.getState();
  const editStore = useContentEditStore.getState();
  const sourceBytes = docStore.basePdfBytes ?? docStore.pdfBytes;

  if (!sourceBytes || !editStore.hasEdits()) return true;

  docStore.setLoading(true);
  try {
    const textEdits = await textEditsPayload(editStore.textEdits);
    const imageEdits = await imageEditsPayload(editStore.imageEdits);
    const result = await invokeLogged<PdfBytesResult>("apply_content_edits", {
      pdfBase64: encodeBase64Pdf(sourceBytes),
      textEditsJson: JSON.stringify(textEdits),
      imageEditsJson: JSON.stringify(imageEdits),
    });

    const newBytes = decodeBase64Pdf(result.dataBase64);
    const pdfDoc = await loadPdfFromBytes(newBytes, getDocumentLoadPassword());
    docStore.applyPdfStructureChange({
      pdfDoc,
      pdfBytes: newBytes,
      pageCount: pdfDoc.numPages,
    });
    if (clearAfter) {
      editStore.clearEdits();
    }
    log.content.info("Content edits applied", { userAction: "content_edit" });
    return true;
  } catch (err) {
    reportError(err, { category: "content", userAction: "content_edit" });
    return false;
  } finally {
    docStore.setLoading(false);
  }
}
