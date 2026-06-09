import { dirname, join } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { normalizeDialogPaths } from "@/lib/dialogPaths";
import { invokeLogged } from "@/lib/tauriInvoke";
import { decodeBase64Pdf, encodeBase64Pdf, loadPdfFromBytes, renderPageToCanvas } from "@/lib/pdf/pdfEngine";
import { ensurePdfExtension, type PdfBytesResult } from "@/lib/pdf/pdfBinary";
import { requireTauriDesktop } from "@/lib/tauriRuntime";
import { useDocumentStore } from "@/stores/documentStore";
import { useAnnotationStore } from "@/stores/annotationStore";
import { createErrorReporter, log } from "@/lib/logging";
import type { ReadFileResult } from "@shared/types";

const showError = createErrorReporter("assembly", "assembly");

function getOpenDocumentBytes(): Uint8Array | null {
  const { pdfBytes, basePdfBytes } = useDocumentStore.getState();
  return pdfBytes ?? basePdfBytes ?? null;
}

async function pickPdfPaths(multiple: boolean): Promise<string[]> {
  requireTauriDesktop("PDF file picker");
  const selected = await open({
    multiple,
    directory: false,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  return normalizeDialogPaths(selected);
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
  const docStore = useDocumentStore.getState();
  const paths = await pickPdfPaths(true);
  if (paths.length === 0) return;

  const openBytes = getOpenDocumentBytes();
  let pdfBase64List: string[];

  if (paths.length === 1) {
    if (!openBytes) {
      showError(new Error("Select at least two PDF files, or open a document and pick one more to merge."));
      return;
    }
    pdfBase64List = [encodeBase64Pdf(openBytes), await readPdfBase64(paths[0]!)];
  } else {
    pdfBase64List = await Promise.all(paths.map(readPdfBase64));
  }

  docStore.setLoading(true);
  try {
    const result = await invokeLogged<PdfBytesResult>("merge_pdfs", { pdfBase64List });
    const bytes = decodeBase64Pdf(result.dataBase64);
    const name = paths[0]!.split(/[/\\]/).pop()?.replace(/\.pdf$/i, "") ?? "merged";
    await applyMergedOrNewDocument(bytes, `${name}-merged.pdf`);
    docStore.setStatusMessage(`Merged ${pdfBase64List.length} PDF(s)`);
  } catch (err) {
    showError(err);
  } finally {
    docStore.setLoading(false);
  }
}

export async function mergeIntoCurrentDocument(): Promise<void> {
  const docStore = useDocumentStore.getState();
  const sourceBytes = getOpenDocumentBytes();
  if (!sourceBytes) {
    showError(new Error("No document open"));
    return;
  }

  const paths = await pickPdfPaths(true);
  if (paths.length === 0) return;

  docStore.setLoading(true);
  try {
    const others = await Promise.all(paths.map(readPdfBase64));
    const pdfBase64List = [encodeBase64Pdf(sourceBytes), ...others];
    const result = await invokeLogged<PdfBytesResult>("merge_pdfs", { pdfBase64List });
    const bytes = decodeBase64Pdf(result.dataBase64);
    const pdfDoc = await loadPdfFromBytes(bytes);

    docStore.applyPdfStructureChange({
      pdfDoc,
      pdfBytes: bytes,
      pageCount: pdfDoc.numPages,
    });
    docStore.setStatusMessage(`Appended ${paths.length} PDF(s) · ${pdfDoc.numPages} pages`);
    log.assembly.info("Merged PDFs into current document", { userAction: "append" });
  } catch (err) {
    showError(err);
  } finally {
    docStore.setLoading(false);
  }
}

export async function extractPagesToFile(pageNumbers: number[]): Promise<void> {
  if (pageNumbers.length === 0) return;

  const docStore = useDocumentStore.getState();
  const sourceBytes = getOpenDocumentBytes();
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

/** Parse comma-separated page ranges (1-based), e.g. `1-3, 5, 7-10`. */
export function parsePageRanges(input: string, maxPage: number): number[][] {
  const ranges: number[][] = [];
  for (const part of input.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.includes("-")) {
      const [startStr, endStr] = trimmed.split("-").map((s) => s.trim());
      const start = Math.max(1, parseInt(startStr, 10));
      const end = Math.min(maxPage, parseInt(endStr, 10));
      if (Number.isNaN(start) || Number.isNaN(end) || start > end) continue;
      ranges.push(pageRange(start, end));
    } else {
      const n = parseInt(trimmed, 10);
      if (!Number.isNaN(n) && n >= 1 && n <= maxPage) ranges.push([n]);
    }
  }
  return ranges;
}

export type SplitMode =
  | "half"
  | "at-page"
  | "at-current"
  | "every-page"
  | "every-n"
  | "custom";

export interface SplitOptions {
  splitAfterPage?: number;
  pagesPerFile?: number;
  customRanges?: string;
}

function pageRange(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

/** Build page groups for each output file from the chosen split mode. */
export function buildSplitRanges(
  mode: SplitMode,
  pageCount: number,
  options: SplitOptions = {},
): number[][] {
  switch (mode) {
    case "half": {
      const mid = Math.ceil(pageCount / 2);
      return [pageRange(1, mid), pageRange(mid + 1, pageCount)];
    }
    case "at-page":
    case "at-current": {
      const after = options.splitAfterPage ?? 1;
      if (after < 1 || after >= pageCount) return [];
      return [pageRange(1, after), pageRange(after + 1, pageCount)];
    }
    case "every-page":
      return Array.from({ length: pageCount }, (_, i) => [i + 1]);
    case "every-n": {
      const chunk = Math.max(1, options.pagesPerFile ?? 1);
      const ranges: number[][] = [];
      for (let start = 1; start <= pageCount; start += chunk) {
        ranges.push(pageRange(start, Math.min(start + chunk - 1, pageCount)));
      }
      return ranges;
    }
    case "custom":
      return parsePageRanges(options.customRanges?.trim() ?? "", pageCount);
  }
}

export function describeSplitParts(ranges: number[][]): string {
  if (ranges.length === 0) return "No valid split — check your settings.";
  const label = (pages: number[]) => {
    if (pages.length === 1) return `page ${pages[0]}`;
    return `pages ${pages[0]}–${pages[pages.length - 1]}`;
  };
  if (ranges.length <= 4) {
    return ranges.map((pages, i) => `File ${i + 1}: ${label(pages)}`).join(" · ");
  }
  return `${ranges.length} files (${label(ranges[0]!)} … ${label(ranges[ranges.length - 1]!)})`;
}

export async function splitPdfWithOptions(
  mode: SplitMode,
  options: SplitOptions = {},
): Promise<void> {
  const pageCount = useDocumentStore.getState().metadata?.pageCount ?? 0;
  if (!pageCount) {
    showError(new Error("No document open"));
    return;
  }
  if (pageCount < 2 && mode !== "custom") {
    showError(new Error("Need at least 2 pages to split"));
    return;
  }

  const ranges = buildSplitRanges(mode, pageCount, options);
  if (ranges.length === 0) {
    if (mode === "custom") {
      showError(
        new Error(`No valid page ranges (use 1-${pageCount}, e.g. 1-3, 4-${pageCount})`),
      );
    } else if (mode === "at-page" || mode === "at-current") {
      showError(new Error(`Split after page must be between 1 and ${pageCount - 1}`));
    } else {
      showError(new Error("Could not build split ranges"));
    }
    return;
  }

  await writeSplitParts(ranges);
}

function requireSourceBytes(): Uint8Array | null {
  const sourceBytes = getOpenDocumentBytes();
  if (!sourceBytes) {
    showError(new Error("No document open"));
    return null;
  }
  return sourceBytes;
}

async function writeSplitParts(ranges: number[][]): Promise<void> {
  const docStore = useDocumentStore.getState();
  const sourceBytes = requireSourceBytes();
  if (!sourceBytes || ranges.length === 0) return;

  requireTauriDesktop("Save PDF");
  const baseName = docStore.fileName.replace(/\.pdf$/i, "");
  const firstPart = await save({
    defaultPath: `${baseName}-part1.pdf`,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (!firstPart) return;

  const outputDir = await dirname(firstPart);

  docStore.setLoading(true);
  try {
    for (let i = 0; i < ranges.length; i++) {
      const pages = ranges[i];
      const result = await invokeLogged<PdfBytesResult>("extract_pdf_pages", {
        pdfBase64: encodeBase64Pdf(sourceBytes),
        pageNumbers: pages,
      });
      const partPath =
        ranges.length === 1
          ? ensurePdfExtension(firstPart)
          : ensurePdfExtension(await join(outputDir, `${baseName}-part${i + 1}.pdf`));
      await invokeLogged("write_pdf_file", {
        path: partPath,
        dataBase64: result.dataBase64,
      });
    }
    docStore.setStatusMessage(`Split into ${ranges.length} file(s)`);
    log.assembly.info("Split PDF into parts", {
      userAction: "split",
      metadata: { parts: ranges.length },
    });
  } catch (err) {
    showError(err);
  } finally {
    docStore.setLoading(false);
  }
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
