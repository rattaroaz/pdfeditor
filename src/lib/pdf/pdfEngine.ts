import * as pdfjsLib from "pdfjs-dist";
import { TextLayer } from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { log } from "@/lib/logging";
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
    log.pdf.info("PDF document loaded", {
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
      const rect = textItemViewportRect(span.item, viewport);
      if (!rect) continue;
      rects.push({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
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

type TextContentItem = Awaited<ReturnType<PdfPage["getTextContent"]>>["items"][number];

interface TextItemRect {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  baselineY: number;
}

/** Viewport rect for a pdf.js text item (scale 1, top-left origin). */
export function textItemViewportRect(
  item: TextContentItem,
  viewport: ReturnType<PdfPage["getViewport"]>,
): TextItemRect | null {
  if (!("str" in item) || !item.str) return null;

  const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
  const fontSize = item.height || Math.hypot(tx[2], tx[3]) || 12;
  const width = item.width || item.str.length * fontSize * 0.52;

  return {
    text: item.str,
    x: tx[4],
    y: tx[5] - fontSize,
    width,
    height: fontSize,
    fontSize,
    baselineY: tx[5],
  };
}

function pointInRect(
  x: number,
  y: number,
  rect: Pick<TextItemRect, "x" | "y" | "width" | "height">,
  pad = 3,
): boolean {
  return (
    x >= rect.x - pad &&
    x <= rect.x + rect.width + pad &&
    y >= rect.y - pad &&
    y <= rect.y + rect.height + pad
  );
}

function mergeLineItems(items: TextItemRect[]): TextHit {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const x = sorted[0]!.x;
  const y = Math.min(...sorted.map((i) => i.y));
  const right = Math.max(...sorted.map((i) => i.x + i.width));
  const bottom = Math.max(...sorted.map((i) => i.y + i.height));
  return {
    text: sorted.map((i) => i.text).join(""),
    x,
    y,
    width: right - x,
    height: bottom - y,
    fontSize: sorted[0]!.fontSize,
  };
}

export async function findTextAtPoint(
  page: PdfPage,
  x: number,
  y: number,
  rotation = 0,
): Promise<TextHit | null> {
  const content = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1, rotation });

  const items: TextItemRect[] = [];
  for (const item of content.items) {
    const rect = textItemViewportRect(item, viewport);
    if (rect?.text.trim()) items.push(rect);
  }
  if (items.length === 0) return null;

  let primary: TextItemRect | null = null;
  let bestDist = Infinity;

  for (const item of items) {
    if (pointInRect(x, y, item)) {
      const cx = item.x + item.width / 2;
      const cy = item.y + item.height / 2;
      const dist = Math.hypot(x - cx, y - cy);
      if (dist < bestDist) {
        bestDist = dist;
        primary = item;
      }
    }
  }

  if (!primary) {
    for (const item of items) {
      const cx = item.x + item.width / 2;
      const cy = item.y + item.height / 2;
      const dist = Math.hypot(x - cx, y - cy);
      if (dist < Math.max(12, item.fontSize) && dist < bestDist) {
        bestDist = dist;
        primary = item;
      }
    }
  }

  if (!primary) return null;

  return mergeContiguousFromPrimary(primary, items);
}

/** Merge the clicked item with horizontally adjacent fragments on the same line (not the whole line). */
function mergeContiguousFromPrimary(primary: TextItemRect, items: TextItemRect[]): TextHit {
  const lineTolerance = Math.max(2, primary.fontSize * 0.2);
  const gap = Math.max(2, primary.fontSize * 0.15);
  const lineItems = items
    .filter((item) => Math.abs(item.baselineY - primary.baselineY) <= lineTolerance)
    .sort((a, b) => a.x - b.x);

  const startIdx = lineItems.indexOf(primary);
  if (startIdx < 0) {
    return {
      text: primary.text,
      x: primary.x,
      y: primary.y,
      width: primary.width,
      height: primary.height,
      fontSize: primary.fontSize,
    };
  }

  let start = startIdx;
  let end = startIdx;
  while (start > 0) {
    const prev = lineItems[start - 1]!;
    const cur = lineItems[start]!;
    if (cur.x - (prev.x + prev.width) > gap) break;
    start--;
  }
  while (end < lineItems.length - 1) {
    const cur = lineItems[end]!;
    const next = lineItems[end + 1]!;
    if (next.x - (cur.x + cur.width) > gap) break;
    end++;
  }

  return mergeLineItems(lineItems.slice(start, end + 1));
}

/** True if the document exposes at least one non-empty text item via pdf.js. */
export async function documentHasExtractableText(doc: PdfDocument): Promise<boolean> {
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    if (content.items.some((item) => "str" in item && !!item.str?.trim())) {
      return true;
    }
  }
  return false;
}

export interface FormWidgetRect {
  /** pdf.js annotation id (unique per widget; radio groups share a name). */
  id?: string;
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

/** pdf.js AnnotationType.WIDGET */
const PDF_ANNOTATION_TYPE_WIDGET = 20;

type PdfWidgetAnnotation = {
  annotationType?: number;
  id?: string;
  fieldName?: string;
  fieldType?: string;
  fieldValue?: string | string[];
  rect?: number[];
  checkBox?: boolean;
  radioButton?: boolean;
  combo?: boolean;
  options?: Array<{ displayValue?: string; exportValue?: string } | string>;
  readOnly?: boolean;
  required?: boolean;
  hidden?: boolean;
  exportValue?: string;
  buttonValue?: string;
  items?: Array<string | { exportValue?: string; displayValue?: string }>;
  editable?: boolean;
};

function widgetTypeFromAnnotation(ann: PdfWidgetAnnotation): string {
  if (ann.checkBox) return "checkbox";
  if (ann.radioButton) return "radio";
  if (ann.fieldType === "Ch") return ann.combo !== false ? "combobox" : "listbox";
  if (ann.fieldType === "Btn") return "checkbox";
  return "text";
}

function widgetValueFromAnnotation(ann: PdfWidgetAnnotation, type: string): string | undefined {
  if (type === "checkbox") {
    const v = ann.fieldValue;
    const on =
      v === ann.exportValue ||
      v === "Yes" ||
      v === "On" ||
      String(v).toLowerCase() === "true";
    return on ? "Yes" : "Off";
  }
  if (type === "radio") {
    if (typeof ann.fieldValue === "string") return ann.fieldValue;
    if (Array.isArray(ann.fieldValue)) return ann.fieldValue[0];
    return ann.buttonValue;
  }
  if (type === "combobox" || type === "listbox" || type === "dropdown") {
    if (Array.isArray(ann.fieldValue)) return ann.fieldValue[0] ?? "";
    return ann.fieldValue ?? "";
  }
  if (Array.isArray(ann.fieldValue)) return ann.fieldValue.join("\n");
  return ann.fieldValue ?? "";
}

function widgetFromAnnotation(
  ann: PdfWidgetAnnotation,
  name: string,
  pageIndex: number,
  viewport: ReturnType<PdfPage["getViewport"]>,
): FormWidgetRect | null {
  if (!ann.rect || ann.rect.length < 4 || ann.hidden) return null;
  const type = widgetTypeFromAnnotation(ann);
  const [x1, y1, x2, y2] = ann.rect;
  const [vx1, vy1] = viewport.convertToViewportPoint(x1, y1);
  const [vx2, vy2] = viewport.convertToViewportPoint(x2, y2);
  return {
    id: ann.id,
    name,
    type,
    pageIndex,
    x: Math.min(vx1, vx2),
    y: Math.min(vy1, vy2),
    width: Math.abs(vx2 - vx1),
    height: Math.abs(vy2 - vy1),
    value: widgetValueFromAnnotation(ann, type),
    options: choiceOptionsFromPdfField({ options: undefined, items: ann.options ?? ann.items }),
    required: ann.required,
    readOnly: ann.readOnly ?? ann.editable === false,
  };
}

function widgetsFromFieldObjects(
  fieldObjects: Record<string, Array<object>>,
  pageIndex: number,
  viewport: ReturnType<PdfPage["getViewport"]>,
): FormWidgetRect[] {
  const widgets: FormWidgetRect[] = [];
  for (const [name, objs] of Object.entries(fieldObjects)) {
    for (const obj of objs) {
      const field = obj as {
        id?: string;
        page?: number;
        rect?: number[];
        type?: string;
        value?: string;
        options?: string[];
        items?: Array<string | { exportValue?: string; displayValue?: string }>;
        required?: boolean;
        readOnly?: boolean;
        editable?: boolean;
      };
      if (field.page !== pageIndex || !field.rect || field.rect.length < 4) continue;
      const [x1, y1, x2, y2] = field.rect;
      const [vx1, vy1] = viewport.convertToViewportPoint(x1, y1);
      const [vx2, vy2] = viewport.convertToViewportPoint(x2, y2);
      widgets.push({
        id: field.id,
        name,
        type: field.type ?? "text",
        pageIndex,
        x: Math.min(vx1, vx2),
        y: Math.min(vy1, vy2),
        width: Math.abs(vx2 - vx1),
        height: Math.abs(vy2 - vy1),
        value: field.value,
        options: choiceOptionsFromPdfField(field),
        required: field.required,
        readOnly: field.readOnly ?? field.editable === false,
      });
    }
  }
  return widgets;
}

/** Collect field values from widget annotations on every page (fallback when getFieldObjects is empty). */
export async function collectFormFieldValuesFromPdf(
  pdfDoc: PdfDocument,
): Promise<Record<string, { name: string; value: string; type: string; required: boolean }>> {
  const values: Record<string, { name: string; value: string; type: string; required: boolean }> =
    {};

  for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber++) {
    const page = await pdfDoc.getPage(pageNumber);
    const annotations = await page.getAnnotations({ intent: "display" });
    for (const raw of annotations) {
      const ann = raw as PdfWidgetAnnotation;
      if (ann.annotationType !== PDF_ANNOTATION_TYPE_WIDGET || !ann.fieldName) continue;
      const type = widgetTypeFromAnnotation(ann);
      const value = widgetValueFromAnnotation(ann, type) ?? "";
      const existing = values[ann.fieldName];
      if (!existing || (value && !existing.value)) {
        values[ann.fieldName] = {
          name: ann.fieldName,
          value,
          type,
          required: !!ann.required,
        };
      }
    }
  }

  return values;
}

/** pdf.js choice fields expose `items`; some producers use plain `options`. */
export function choiceOptionsFromPdfField(field: {
  options?: string[];
  items?: Array<string | { exportValue?: string; displayValue?: string }>;
}): string[] | undefined {
  if (field.options?.length) return field.options;
  if (!field.items?.length) return undefined;
  const labels = field.items
    .map((item) => {
      if (typeof item === "string") return item;
      return item.displayValue ?? item.exportValue ?? "";
    })
    .filter(Boolean);
  return labels.length > 0 ? labels : undefined;
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
  _scale: number,
  rotation = 0,
): Promise<FormWidgetRect[]> {
  const page = await pdfDoc.getPage(pageNumber);
  // Always compute in unscaled (scale-1) viewport coords; the form layer applies
  // the current zoom scale itself (same convention as newly-placed fields).
  const viewport = page.getViewport({ scale: 1, rotation });
  const pageIndex = pageNumber - 1;

  const annotations = await page.getAnnotations({ intent: "display" });
  const fromAnnotations: FormWidgetRect[] = [];
  for (const raw of annotations) {
    const ann = raw as PdfWidgetAnnotation;
    if (ann.annotationType !== PDF_ANNOTATION_TYPE_WIDGET || !ann.fieldName) continue;
    const widget = widgetFromAnnotation(ann, ann.fieldName, pageIndex, viewport);
    if (widget && widget.width > 0 && widget.height > 0) {
      fromAnnotations.push(widget);
    }
  }
  if (fromAnnotations.length > 0) return fromAnnotations;

  const fieldObjects = await pdfDoc.getFieldObjects();
  if (!fieldObjects) return [];
  return widgetsFromFieldObjects(fieldObjects, pageIndex, viewport);
}

/** Locate a form field widget anywhere in the document (viewport coords at scale 1). */
export async function findFormWidgetByName(
  pdfDoc: PdfDocument,
  fieldName: string,
  rotation = 0,
): Promise<FormWidgetRect | null> {
  for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber++) {
    const widgets = await getFormWidgetsForPage(pdfDoc, pageNumber, 1, rotation);
    const match = widgets.find((w) => w.name === fieldName);
    if (match) return match;
  }
  return null;
}
