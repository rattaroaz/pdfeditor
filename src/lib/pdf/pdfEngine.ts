import * as pdfjsLib from "pdfjs-dist";
import { TextLayer } from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { logger } from "@/lib/logger";
import type { OutlineItem, HighlightRect } from "@shared/types";
export { decodeBase64Pdf, encodeBase64Pdf } from "./pdfBinary";

export class PdfPasswordRequiredError extends Error {
  incorrect: boolean;
  constructor(incorrect = false) {
    super(incorrect ? "Incorrect PDF password" : "PDF password required");
    this.name = "PdfPasswordRequiredError";
    this.incorrect = incorrect;
  }
}

// Served from /public — stable URL in Tauri dev + production (hashed asset URLs break workers)
pdfjsLib.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`;

export type PdfDocument = PDFDocumentProxy;
export type PdfPage = PDFPageProxy;

export interface PageLink {
  rect: { x: number; y: number; width: number; height: number };
  url?: string;
  destPageIndex?: number;
}

export async function loadPdfFromBytes(
  data: Uint8Array,
  password?: string,
): Promise<PdfDocument> {
  const start = performance.now();
  const loadingTask = pdfjsLib.getDocument({
    data: data.slice(),
    useSystemFonts: true,
    password,
  });
  try {
    const doc = await loadingTask.promise;
    logger.info("PDF document loaded", {
      durationMs: Math.round(performance.now() - start),
      pageCount: doc.numPages,
    });
    return doc;
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    if (code === 1 || code === 2) {
      throw new PdfPasswordRequiredError(code === 2);
    }
    throw err;
  }
}

export async function renderPageToCanvas(
  page: PdfPage,
  canvas: HTMLCanvasElement,
  scale: number,
  signal?: AbortSignal,
  rotation = 0,
): Promise<void> {
  const viewport = page.getViewport({ scale, rotation });
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context unavailable");

  const outputScale = window.devicePixelRatio || 1;
  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;

  context.setTransform(outputScale, 0, 0, outputScale, 0, 0);

  const task: RenderTask = page.render({
    canvasContext: context,
    viewport,
    canvas,
  });

  const onAbort = () => task.cancel();
  signal?.addEventListener("abort", onAbort);

  try {
    await task.promise;
  } catch (err) {
    if (signal?.aborted) return;
    throw err;
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

export async function renderTextLayer(
  page: PdfPage,
  container: HTMLElement,
  scale: number,
  rotation = 0,
  signal?: AbortSignal,
): Promise<TextLayer> {
  const viewport = page.getViewport({ scale, rotation });
  container.innerHTML = "";
  container.style.width = `${viewport.width}px`;
  container.style.height = `${viewport.height}px`;

  const textLayer = new TextLayer({
    textContentSource: page.streamTextContent
      ? page.streamTextContent()
      : await page.getTextContent(),
    container,
    viewport,
  });

  const onAbort = () => textLayer.cancel();
  signal?.addEventListener("abort", onAbort);

  try {
    await textLayer.render();
  } catch (err) {
    if (signal?.aborted) return textLayer;
    throw err;
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }

  return textLayer;
}

export async function extractTextFromPage(page: PdfPage): Promise<string> {
  const content = await page.getTextContent();
  return content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
}

export async function searchDocument(
  doc: PdfDocument,
  query: string,
  caseSensitive = false,
  wholeWord = false,
): Promise<Array<{ pageIndex: number; matchIndex: number; text: string }>> {
  const matches: Array<{ pageIndex: number; matchIndex: number; text: string }> = [];
  const flags = caseSensitive ? "g" : "gi";
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
  const regex = new RegExp(pattern, flags);

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const text = await extractTextFromPage(page);
    let match: RegExpExecArray | null;
    let matchIndex = 0;
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        pageIndex: i - 1,
        matchIndex: matchIndex++,
        text: match[0],
      });
      if (match[0].length === 0) regex.lastIndex++;
    }
  }
  return matches;
}

export async function getPageSearchHighlights(
  page: PdfPage,
  query: string,
  caseSensitive = false,
  wholeWord = false,
  rotation = 0,
): Promise<HighlightRect[]> {
  if (!query.trim()) return [];

  const content = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1, rotation });
  const flags = caseSensitive ? "g" : "gi";
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
  const regex = new RegExp(pattern, flags);

  let fullText = "";
  const spans: Array<{
    start: number;
    end: number;
    item: (typeof content.items)[number];
  }> = [];

  for (const item of content.items) {
    if (!("str" in item) || !item.str) continue;
    const start = fullText.length;
    fullText += item.str;
    spans.push({ start, end: fullText.length, item });
    fullText += " ";
  }

  const rects: HighlightRect[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(fullText)) !== null) {
    const mStart = match.index;
    const mEnd = mStart + match[0].length;
    for (const span of spans) {
      if (span.end <= mStart || span.start >= mEnd) continue;
      const item = span.item;
      if (!("str" in item) || !item.str) continue;
      const tx = item.transform[4];
      const ty = item.transform[5];
      const h = item.height || Math.abs(item.transform[3]) || 12;
      const w = item.width || item.str.length * 6;
      const [vx, vy] = viewport.convertToViewportPoint(tx, ty);
      rects.push({
        x: vx,
        y: vy - h,
        width: w,
        height: h,
      });
    }
    if (match[0].length === 0) regex.lastIndex++;
  }
  return rects;
}

async function resolveDestPageIndex(
  doc: PdfDocument,
  dest: unknown,
): Promise<number | null> {
  if (!dest) return null;
  try {
    let resolved: unknown = dest;
    if (typeof dest === "string") {
      resolved = await doc.getDestination(dest);
    }
    if (!Array.isArray(resolved) || !resolved[0]) return null;
    const pageRef = resolved[0];
    const pageIndex = await doc.getPageIndex(pageRef);
    return pageIndex;
  } catch {
    return null;
  }
}

export async function getDocumentOutline(doc: PdfDocument): Promise<OutlineItem[]> {
  const raw = await doc.getOutline();
  if (!raw?.length) return [];

  const parseItems = async (
    items: NonNullable<Awaited<ReturnType<PdfDocument["getOutline"]>>>,
    level: number,
  ): Promise<OutlineItem[]> => {
    const result: OutlineItem[] = [];
    for (const item of items) {
      const pageIndex = item.dest ? await resolveDestPageIndex(doc, item.dest) : null;
      const node: OutlineItem = {
        title: item.title || "Untitled",
        pageIndex: pageIndex ?? 0,
        level,
        children: item.items?.length ? await parseItems(item.items, level + 1) : [],
      };
      result.push(node);
    }
    return result;
  };

  return parseItems(raw, 0);
}

export async function getPageLinks(page: PdfPage, doc: PdfDocument): Promise<PageLink[]> {
  const annotations = await page.getAnnotations();
  const links: PageLink[] = [];

  for (const ann of annotations) {
    if (ann.subtype !== "Link") continue;
    const rect = ann.rect;
    if (!rect || rect.length < 4) continue;

    const [x1, y1, x2, y2] = rect;
    const link: PageLink = {
      rect: {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
      },
    };

    if (ann.url) {
      link.url = ann.url;
    } else if (ann.dest) {
      const pageIndex = await resolveDestPageIndex(doc, ann.dest);
      if (pageIndex !== null) link.destPageIndex = pageIndex;
    }

    if (link.url || link.destPageIndex !== undefined) {
      links.push(link);
    }
  }

  return links;
}

export interface TextHit {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
}

export async function findTextAtPoint(
  page: PdfPage,
  x: number,
  y: number,
  rotation = 0,
): Promise<TextHit | null> {
  const content = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1, rotation });

  for (const item of content.items) {
    if (!("str" in item) || !item.str?.trim()) continue;
    const tx = item.transform[4];
    const ty = item.transform[5];
    const h = item.height || Math.abs(item.transform[3]) || 12;
    const w = item.width || item.str.length * 6;
    const [vx, vy] = viewport.convertToViewportPoint(tx, ty);
    const rect = { x: vx, y: vy - h, width: w, height: h };
    if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height) {
      return {
        text: item.str,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        fontSize: h,
      };
    }
  }
  return null;
}

export interface FormWidgetRect {
  name: string;
  type: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  value?: string;
  options?: string[];
  required?: boolean;
  readOnly?: boolean;
}

/** Viewport coords at scale 1 (top-left origin, same as annotation/content edit layers). */
export function viewportRectToPdfRect(
  page: PdfPage,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation = 0,
): [number, number, number, number] {
  const viewport = page.getViewport({ scale: 1, rotation });
  const [x1, y1] = viewport.convertToPdfPoint(x, y);
  const [x2, y2] = viewport.convertToPdfPoint(x + width, y + height);
  return [
    Math.min(x1, x2),
    Math.min(y1, y2),
    Math.max(x1, x2),
    Math.max(y1, y2),
  ];
}

export async function getFormWidgetsForPage(
  pdfDoc: PdfDocument,
  pageNumber: number,
  scale: number,
  rotation = 0,
): Promise<FormWidgetRect[]> {
  const fieldObjects = await pdfDoc.getFieldObjects();
  if (!fieldObjects) return [];

  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale, rotation });
  const pageIndex = pageNumber - 1;
  const widgets: FormWidgetRect[] = [];

  for (const [name, objs] of Object.entries(fieldObjects)) {
    for (const obj of objs) {
      const field = obj as {
        page?: number;
        rect?: number[];
        type?: string;
        value?: string;
        options?: string[];
        required?: boolean;
        readOnly?: boolean;
      };
      if (field.page !== pageIndex || !field.rect || field.rect.length < 4) continue;
      const [x1, y1, x2, y2] = field.rect;
      const [vx1, vy1] = viewport.convertToViewportPoint(x1, y1);
      const [vx2, vy2] = viewport.convertToViewportPoint(x2, y2);
      widgets.push({
        name,
        type: field.type ?? "text",
        pageIndex,
        x: Math.min(vx1, vx2),
        y: Math.min(vy1, vy2),
        width: Math.abs(vx2 - vx1),
        height: Math.abs(vy2 - vy1),
        value: field.value,
        options: field.options,
        required: field.required,
        readOnly: field.readOnly,
      });
    }
  }
  return widgets;
}
