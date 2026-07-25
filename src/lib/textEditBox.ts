import type { CSSProperties } from "react";

/** Extra PDF-point width so the box stays slightly wider than measured glyphs. */
export const TEXT_BOX_WIDTH_BUFFER = 2;
/** Horizontal padding for PDF white-out cover (PDF points). */
export const TEXT_COVER_H_PAD = 1;
/** Vertical padding for PDF white-out cover (PDF points). */
export const TEXT_COVER_V_PAD = 0.5;
/** Padding above text in markup/form boxes (PDF points). Matches Rust `TEXT_BOX_TOP_PAD`. */
export const TEXT_BOX_TOP_PAD = 1;
/** Minimum bottom padding (PDF points); larger fonts get more via {@link DESCENDER_RATIO}. */
export const TEXT_BOX_BOTTOM_PAD = 2;
/** Fraction of font size reserved below the baseline for descenders (g, j, p, y). */
export const DESCENDER_RATIO = 0.22;
/** @deprecated Use TEXT_BOX_TOP_PAD + descender padding */
export const TEXT_BOX_V_PAD = TEXT_BOX_TOP_PAD;

export const DEFAULT_TEXT_FONT_SIZE = 12;
export const MIN_TEXT_FONT_SIZE = 6;
export const MAX_TEXT_FONT_SIZE = 144;

/** Extra bottom padding for dropdown/combobox fields (PDF points). */
export const DROPDOWN_EXTRA_BOTTOM_PAD = 2;
/** Minimum descender padding for dropdown fields (PDF points). */
export const DROPDOWN_MIN_DESCENDER_PAD = 2;

/** Bottom padding for dropdowns: scaled to font size plus a small fixed buffer for descenders. */
export function dropdownDescenderPadding(fontSize: number): number {
  return (
    Math.max(DROPDOWN_MIN_DESCENDER_PAD, Math.ceil(fontSize * DESCENDER_RATIO)) +
    DROPDOWN_EXTRA_BOTTOM_PAD
  );
}

/** Map dropdown box height to font size. */
export function dropdownFontSizeFromBoxHeight(boxHeight: number): number {
  const raw = Math.round((boxHeight - TEXT_BOX_TOP_PAD) / (1 + DESCENDER_RATIO));
  let size = Math.min(MAX_TEXT_FONT_SIZE, Math.max(MIN_TEXT_FONT_SIZE, raw));
  while (size < MAX_TEXT_FONT_SIZE && dropdownBoxHeightFromFontSize(size + 1) <= boxHeight) {
    size += 1;
  }
  while (size > MIN_TEXT_FONT_SIZE && dropdownBoxHeightFromFontSize(size) > boxHeight) {
    size -= 1;
  }
  return size;
}

/** Dropdown box height for a font size with tight descender room. */
export function dropdownBoxHeightFromFontSize(fontSize: number): number {
  return TEXT_BOX_TOP_PAD + fontSize + dropdownDescenderPadding(fontSize);
}

/** Normalize a dragged dropdown height to font size and matching box height. */
export function layoutDropdownFromDrag(dragHeight: number): { fontSize: number; height: number } {
  const fontSize = dropdownFontSizeFromBoxHeight(dragHeight);
  return { fontSize, height: dropdownBoxHeightFromFontSize(fontSize) };
}

/** CSS for dropdown labels: tight padding, no scrollbars. */
export function dropdownTextContentStyle(fontSize: number, scale = 1): CSSProperties {
  const fontPx = fontSize * scale;
  return {
    boxSizing: "border-box",
    height: "100%",
    width: "100%",
    lineHeight: `${fontPx}px`,
    paddingTop: TEXT_BOX_TOP_PAD * scale,
    paddingBottom: dropdownDescenderPadding(fontSize) * scale,
    paddingLeft: 0,
    paddingRight: 0,
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
}

/** Full field style for dropdown controls (closed state + sizing from box height). */
export function dropdownFieldTextStyle(fieldHeight: number, scale = 1): CSSProperties {
  const fontSize = dropdownFontSizeFromBoxHeight(fieldHeight);
  return {
    fontFamily: "Helvetica, Arial, sans-serif",
    fontSize: fontSize * scale,
    ...dropdownTextContentStyle(fontSize, scale),
    paddingRight: 18 * scale,
  };
}

/** Row style for open dropdown option buttons. */
export function dropdownOptionRowStyle(fontSize: number, scale = 1): CSSProperties {
  const fontPx = fontSize * scale;
  return {
    fontFamily: "Helvetica, Arial, sans-serif",
    fontSize: fontPx,
    lineHeight: `${fontPx}px`,
    height: "auto",
    width: "100%",
    paddingTop: 2 * scale,
    paddingBottom: dropdownDescenderPadding(fontSize) * scale,
    paddingLeft: 0,
    paddingRight: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
}

/** Bottom padding scaled to font size so descenders fit at any box height. */
export function descenderPadding(fontSize: number): number {
  return Math.max(TEXT_BOX_BOTTOM_PAD, Math.ceil(fontSize * DESCENDER_RATIO));
}

/** Map a text-box height (PDF points) to font size; taller boxes yield larger text. */
export function fontSizeFromBoxHeight(boxHeight: number): number {
  const raw = Math.round((boxHeight - TEXT_BOX_TOP_PAD) / (1 + DESCENDER_RATIO));
  let size = Math.min(MAX_TEXT_FONT_SIZE, Math.max(MIN_TEXT_FONT_SIZE, raw));
  while (size < MAX_TEXT_FONT_SIZE && boxHeightFromFontSize(size + 1) <= boxHeight) {
    size += 1;
  }
  while (size > MIN_TEXT_FONT_SIZE && boxHeightFromFontSize(size) > boxHeight) {
    size -= 1;
  }
  return size;
}

/** Box height for a given font size including proportional room for descenders. */
export function boxHeightFromFontSize(fontSize: number): number {
  return TEXT_BOX_TOP_PAD + fontSize + descenderPadding(fontSize);
}

/** CSS for text boxes: padding + line-height so descenders stay inside the box. */
export function textBoxContentStyle(fontSize: number, scale = 1): CSSProperties {
  const fontPx = fontSize * scale;
  return {
    boxSizing: "border-box",
    height: "100%",
    width: "100%",
    lineHeight: `${fontPx}px`,
    paddingTop: TEXT_BOX_TOP_PAD * scale,
    paddingBottom: descenderPadding(fontSize) * scale,
    paddingLeft: 0,
    paddingRight: 0,
    margin: 0,
    overflowX: "auto",
    overflowY: "hidden",
  };
}

/** Markup text boxes: fixed padding, no height override (used on sized annotation divs). */
export function markupTextBoxStyle(scale = 1): CSSProperties {
  return {
    boxSizing: "border-box",
    lineHeight: 1,
    paddingTop: TEXT_BOX_TOP_PAD * scale,
    paddingBottom: TEXT_BOX_BOTTOM_PAD * scale,
  };
}

/** Markup font size from box height (fixed top/bottom padding, not proportional). */
export function markupFontSizeFromBoxHeight(boxHeight: number): number {
  const size = Math.round(boxHeight - TEXT_BOX_TOP_PAD - TEXT_BOX_BOTTOM_PAD);
  return Math.min(MAX_TEXT_FONT_SIZE, Math.max(MIN_TEXT_FONT_SIZE, size));
}

/** Markup box height for a font size (fixed padding). */
export function markupBoxHeightFromFontSize(fontSize: number): number {
  return fontSize + TEXT_BOX_TOP_PAD + TEXT_BOX_BOTTOM_PAD;
}

/** Normalize a dragged markup box height to font size and matching box height. */
export function layoutTextBoxFromDrag(dragHeight: number): { fontSize: number; height: number } {
  const fontSize = markupFontSizeFromBoxHeight(dragHeight);
  return { fontSize, height: markupBoxHeightFromFontSize(fontSize) };
}

let measureCtx: CanvasRenderingContext2D | null = null;

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (!measureCtx) {
    const canvas = document.createElement("canvas");
    measureCtx = canvas.getContext("2d");
  }
  return measureCtx;
}

export function measureTextWidth(
  text: string,
  fontSize: number,
  fontFamily = "Helvetica, Arial, sans-serif",
): number {
  if (!text) return fontSize * 0.35;
  const ctx = getMeasureCtx();
  if (!ctx) return text.length * fontSize * 0.52;
  ctx.font = `${fontSize}px ${fontFamily}`;
  return ctx.measureText(text).width;
}

/** Max line width for multiline strings (PDF points). */
export function measureMultilineWidth(
  text: string,
  fontSize: number,
  fontFamily = "Helvetica, Arial, sans-serif",
): number {
  const lines = text.split("\n");
  let max = fontSize * 0.35;
  for (const line of lines) {
    max = Math.max(max, measureTextWidth(line, fontSize, fontFamily));
  }
  return max;
}

let measureMirror: HTMLDivElement | null = null;

/**
 * Measure text box size from a live textarea so width/height match rendered glyphs
 * (canvas measureText can lag behind the actual control, especially while typing).
 */
export function coverRegionFromHit(hit: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number; width: number; height: number } {
  return {
    x: hit.x - TEXT_COVER_H_PAD,
    y: hit.y - TEXT_COVER_V_PAD,
    width: hit.width + TEXT_COVER_H_PAD * 2,
    height: hit.height + TEXT_COVER_V_PAD * 2,
  };
}

export function coverLayoutMinimums(
  edit: {
    coverOld: boolean;
    coverWidth?: number;
    coverHeight?: number;
    oldText?: string;
    fontSize: number;
  },
  newText = "",
): { minWidth?: number; minHeight?: number } {
  if (!edit.coverOld) return {};
  const contentWidth = measureTextWidth(newText, edit.fontSize) + TEXT_BOX_WIDTH_BUFFER;
  const originalWidth = measureTextWidth(edit.oldText ?? "", edit.fontSize) + TEXT_BOX_WIDTH_BUFFER;
  const textMinWidth = Math.max(contentWidth, originalWidth);
  const lines = Math.max(1, newText.split("\n").length);
  const textMinHeight =
    TEXT_BOX_TOP_PAD + lines * edit.fontSize + descenderPadding(edit.fontSize);
  return {
    // Width stays at least the original cover so shorter replacements still white-out old text.
    minWidth: Math.max(edit.coverWidth ?? 0, textMinWidth),
    // Height matches the CSS padding model used by textBoxContentStyle.
    minHeight: textMinHeight,
  };
}

/** Size a replacement edit to the measured text, positioned over the clicked hit. */
export function layoutCoverTextEdit(
  text: string,
  fontSize: number,
  hit: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  // Prefer the pdf.js hit width so the white-out covers the original glyphs.
  const tight = computeTextEditBox(text, fontSize, { minWidth: hit.width });
  return alignBoxToHit(hit, tight);
}

export function measureTextBoxFromTextarea(
  el: HTMLTextAreaElement,
  fontSize: number,
  scale: number,
  opts?: { coverOld?: boolean; minWidth?: number; minHeight?: number },
): { width: number; height: number } {
  if (typeof document === "undefined" || scale <= 0) {
    return computeTextEditBox(el.value, fontSize, opts);
  }

  if (!measureMirror) {
    measureMirror = document.createElement("div");
    measureMirror.setAttribute("aria-hidden", "true");
    measureMirror.style.position = "fixed";
    measureMirror.style.left = "-9999px";
    measureMirror.style.top = "0";
    measureMirror.style.visibility = "hidden";
    measureMirror.style.pointerEvents = "none";
    measureMirror.style.whiteSpace = "pre";
    document.body.appendChild(measureMirror);
  }

  const style = window.getComputedStyle(el);
  measureMirror.style.font = style.font;
  measureMirror.style.fontSize = style.fontSize;
  measureMirror.style.lineHeight = style.lineHeight;
  measureMirror.style.letterSpacing = style.letterSpacing;
  measureMirror.style.padding = style.padding;
  measureMirror.style.border = style.border;
  measureMirror.style.boxSizing = style.boxSizing;
  measureMirror.textContent = el.value.length > 0 ? el.value : "\u00a0";

  // Mirror already includes textBoxContentStyle padding — do not add cover pads again.
  const measuredWidth = measureMirror.offsetWidth / scale;
  const measuredHeight = measureMirror.offsetHeight / scale;

  const width = Math.max(opts?.minWidth ?? 4, measuredWidth + TEXT_BOX_WIDTH_BUFFER);
  const height = Math.max(
    opts?.minHeight ?? boxHeightFromFontSize(fontSize),
    measuredHeight,
  );

  return {
    width: Number.isFinite(width) ? width : opts?.minWidth ?? 4,
    height: Number.isFinite(height) ? height : opts?.minHeight ?? boxHeightFromFontSize(fontSize),
  };
}

export function computeTextEditBox(
  text: string,
  fontSize: number,
  opts?: { coverOld?: boolean; minWidth?: number; minHeight?: number },
): { width: number; height: number } {
  const lines = text.split("\n");
  const measured = measureMultilineWidth(text, fontSize);
  // Cover pads are applied once on save for PDF white-out, not in the UI box.
  const width = Math.max(opts?.minWidth ?? 4, measured + TEXT_BOX_WIDTH_BUFFER);
  const lineBlockHeight =
    TEXT_BOX_TOP_PAD + lines.length * fontSize + descenderPadding(fontSize);
  const height = Math.max(opts?.minHeight ?? boxHeightFromFontSize(fontSize), lineBlockHeight);
  return { width, height };
}

/**
 * Pin the content area to the pdf.js hit: after TEXT_BOX_TOP_PAD, glyphs sit on hit.y.
 * Cover white-out padding is applied later on save, not by shifting the overlay.
 */
export function alignBoxToHit(
  hit: { x: number; y: number; width: number; height: number },
  box: { width: number; height: number },
  _coverOld = false,
): { x: number; y: number; width: number; height: number } {
  return {
    x: hit.x,
    y: hit.y - TEXT_BOX_TOP_PAD,
    width: box.width,
    height: box.height,
  };
}
