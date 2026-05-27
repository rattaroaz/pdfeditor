import { open, save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { invokeLogged } from "@/lib/tauriInvoke";
import { decodeBase64Pdf, encodeBase64Pdf, loadPdfFromBytes, renderPageToCanvas } from "@/lib/pdf/pdfEngine";
import { ensurePdfExtension } from "@/lib/pdf/pdfBinary";
import { useDocumentStore } from "@/stores/documentStore";
import { useAnnotationStore } from "@/stores/annotationStore";
import { useUiStore } from "@/stores/uiStore";
import { errorMessage } from "@/lib/parseInvokeError";
import { log } from "@/lib/logging";
import type { ReadFileResult } from "@shared/types";

interface PdfBytesResult {
  dataBase64: string;
}

function showError(err: unknown): void {
  useUiStore.getState().showError({
    errorId: crypto.randomUUID(),
    message: errorMessage(err),
  });
}

async function readPdfBase64(path: string): Promise<string> {
  const result = await invokeLogged<ReadFileResult>("read_pdf_file", { path });
  return result.dataBase64;
}

async function applyMergedOrNewDocument(newBytes: Uint8Array, fileName: string): Promise<void> {
  const docStore = useDocumentStore.getState();
  const annStore = useAnnotationStore.getState();
  const pdfDoc = await loadPdfFromBytes(newBytes);

  docStore.setDocument({
    filePath: "",
    fileName,
    pdfDoc,
    pdfBytes: newBytes,
    metadata: {
      pageCount: pdfDoc.numPages,
      fileSize: newBytes.byteLength,
    },
  });
  useDocumentStore.setState({
    basePdfBytes: newBytes.slice(),
    isDirty: true,
  });
  annStore.clearAnnotations();
  log.assembly.info("Document loaded from assembly operation", { userAction: "assembly" });
}

export async function mergePdfFromDialog(): Promise<void> {
  const selected = await open({
    multiple: true,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (!selected || !Array.isArray(selected) || selected.length < 2) return;

  const docStore = useDocumentStore.getState();
  docStore.setLoading(true);
  try {
    const base64List = await Promise.all(selected.map(readPdfBase64));
    const result = await invokeLogged<PdfBytesResult>("merge_pdfs", { pdfBase64List: base64List });
    const bytes = decodeBase64Pdf(result.dataBase64);
    const name = selected[0].split(/[/\\]/).pop()?.replace(/\.pdf$/i, "") ?? "merged";
    await applyMergedOrNewDocument(bytes, `${name}-merged.pdf`);
  } catch (err) {
    showError(err);
  } finally {
    docStore.setLoading(false);
  }
}

export async function mergeIntoCurrentDocument(): Promise<void> {
  const docStore = useDocumentStore.getState();
  const sourceBytes = docStore.basePdfBytes ?? docStore.pdfBytes;
  if (!sourceBytes) {
    showError(new Error("No document open"));
    return;
  }

  const selected = await open({
    multiple: true,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (!selected || !Array.isArray(selected) || selected.length === 0) return;

  docStore.setLoading(true);
  try {
    const others = await Promise.all(selected.map(readPdfBase64));
    const pdfBase64List = [encodeBase64Pdf(sourceBytes), ...others];
    const result = await invokeLogged<PdfBytesResult>("merge_pdfs", { pdfBase64List });
    const bytes = decodeBase64Pdf(result.dataBase64);
    const pdfDoc = await loadPdfFromBytes(bytes);

    docStore.applyPdfStructureChange({
      pdfDoc,
      pdfBytes: bytes,
      pageCount: pdfDoc.numPages,
    });
    log.assembly.info("Merged PDFs into current document", { userAction: "merge" });
  } catch (err) {
    showError(err);
  } finally {
    docStore.setLoading(false);
  }
}

export async function extractPagesToFile(pageNumbers: number[]): Promise<void> {
  if (pageNumbers.length === 0) return;

  const docStore = useDocumentStore.getState();
  const sourceBytes = docStore.basePdfBytes ?? docStore.pdfBytes;
  if (!sourceBytes) {
    showError(new Error("No document open"));
    return;
  }

  const defaultName = docStore.fileName.replace(/\.pdf$/i, "") + "-extract.pdf";
  const target = await save({
    defaultPath: defaultName,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (!target) return;

  docStore.setLoading(true);
  try {
    const result = await invokeLogged<PdfBytesResult>("extract_pdf_pages", {
      pdfBase64: encodeBase64Pdf(sourceBytes),
      pageNumbers: [...pageNumbers].sort((a, b) => a - b),
    });
    await invokeLogged("write_pdf_file", {
      path: ensurePdfExtension(target),
      dataBase64: result.dataBase64,
    });
    docStore.setStatusMessage(`Extracted ${pageNumbers.length} page(s)`);
    log.assembly.info("Extracted pages to file", { userAction: "extract", path: target });
  } catch (err) {
    showError(err);
  } finally {
    docStore.setLoading(false);
  }
}

export async function splitPdfByRanges(): Promise<void> {
  const docStore = useDocumentStore.getState();
  const pageCount = docStore.metadata?.pageCount ?? 0;
  if (!pageCount) return;

  const input = window.prompt(
    `Split into parts. Enter ranges (1-${pageCount}), e.g. 1-3, 4-${pageCount}:`,
    `1-${Math.ceil(pageCount / 2)}, ${Math.ceil(pageCount / 2) + 1}-${pageCount}`,
  );
  if (!input?.trim()) return;

  const sourceBytes = docStore.basePdfBytes ?? docStore.pdfBytes;
  if (!sourceBytes) return;

  const ranges = parsePageRanges(input, pageCount);
  if (ranges.length === 0) {
    showError(new Error("No valid page ranges"));
    return;
  }

  const firstPart = await save({
    defaultPath: docStore.fileName.replace(/\.pdf$/i, "") + "-part1.pdf",
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (!firstPart) return;

  const sep = firstPart.includes("\\") ? "\\" : "/";
  const basePath = firstPart.slice(0, firstPart.lastIndexOf(sep));
  const baseName = docStore.fileName.replace(/\.pdf$/i, "");

  docStore.setLoading(true);
  try {
    for (let i = 0; i < ranges.length; i++) {
      const pages = ranges[i];
      const result = await invokeLogged<PdfBytesResult>("extract_pdf_pages", {
        pdfBase64: encodeBase64Pdf(sourceBytes),
        pageNumbers: pages,
      });
      const partPath = `${basePath}${sep}${baseName}-part${i + 1}.pdf`;
      await invokeLogged("write_pdf_file", {
        path: partPath,
        dataBase64: result.dataBase64,
      });
    }
    docStore.setStatusMessage(`Split into ${ranges.length} file(s)`);
  } catch (err) {
    showError(err);
  } finally {
    docStore.setLoading(false);
  }
}

function parsePageRanges(input: string, maxPage: number): number[][] {
  const ranges: number[][] = [];
  for (const part of input.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.includes("-")) {
      const [startStr, endStr] = trimmed.split("-").map((s) => s.trim());
      const start = Math.max(1, parseInt(startStr, 10));
      const end = Math.min(maxPage, parseInt(endStr, 10));
      if (Number.isNaN(start) || Number.isNaN(end) || start > end) continue;
      ranges.push(Array.from({ length: end - start + 1 }, (_, i) => start + i));
    } else {
      const n = parseInt(trimmed, 10);
      if (!Number.isNaN(n) && n >= 1 && n <= maxPage) ranges.push([n]);
    }
  }
  return ranges;
}

export async function exportPageAsPng(pageNumber: number, dpi = 150): Promise<void> {
  const docStore = useDocumentStore.getState();
  const pdfDoc = docStore.pdfDoc;
  if (!pdfDoc) {
    showError(new Error("No document open"));
    return;
  }

  const defaultName = `${docStore.fileName.replace(/\.pdf$/i, "")}-page${pageNumber}.png`;
  const target = await save({
    defaultPath: defaultName,
    filters: [{ name: "PNG", extensions: ["png"] }],
  });
  if (!target) return;

  try {
    const page = await pdfDoc.getPage(pageNumber);
    const canvas = document.createElement("canvas");
    const scale = dpi / 72;
    await renderPageToCanvas(page, canvas, scale);

    const dataUrl = canvas.toDataURL("image/png");
    const base64 = dataUrl.split(",")[1];
    if (!base64) throw new Error("Failed to encode PNG");

    const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    await writeFile(target, binary);
    docStore.setStatusMessage(`Exported page ${pageNumber} as PNG`);
    log.assembly.info("Exported page as PNG", { userAction: "export", pageNumber });
  } catch (err) {
    showError(err);
  }
}
