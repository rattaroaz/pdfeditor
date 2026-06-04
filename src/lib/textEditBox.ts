/** Extra PDF-point width so the box stays slightly wider than measured glyphs. */
export const TEXT_BOX_WIDTH_BUFFER = 2;
/** Horizontal padding for PDF white-out cover (PDF points). */
export const TEXT_COVER_H_PAD = 1;
/** Vertical padding for PDF white-out cover (PDF points). */
export const TEXT_COVER_V_PAD = 0.5;

export const DEFAULT_TEXT_FONT_SIZE = 12;
export const MIN_TEXT_FONT_SIZE = 6;
export const MAX_TEXT_FONT_SIZE = 144;

/** Map a dragged text-box height (PDF points) to a font size. */
export function fontSizeFromBoxHeight(boxHeight: number): number {
  const size = Math.round(boxHeight);
  return Math.min(MAX_TEXT_FONT_SIZE, Math.max(MIN_TEXT_FONT_SIZE, size));
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
export function measureTextBoxFromTextarea(
  el: HTMLTextAreaElement,
  fontSize: number,
  scale: number,
  opts?: { coverOld?: boolean; minWidth?: number },
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

  const hPad = opts?.coverOld ? TEXT_COVER_H_PAD : 0;
  const vPad = opts?.coverOld ? TEXT_COVER_V_PAD : 0;
  const widthPx = measureMirror.offsetWidth;
  const heightPx = measureMirror.offsetHeight;
  const measuredWidth = widthPx / scale + hPad * 2;
  const measuredHeight = heightPx / scale + vPad * 2;

  const width = Math.max(opts?.minWidth ?? 4, measuredWidth + TEXT_BOX_WIDTH_BUFFER);
  const height = Math.max(fontSize + vPad * 2, measuredHeight);

  return {
    width: Number.isFinite(width) ? width : opts?.minWidth ?? 4,
    height: Number.isFinite(height) ? height : fontSize + vPad * 2,
  };
}

export function computeTextEditBox(
  text: string,
  fontSize: number,
  opts?: { coverOld?: boolean; minWidth?: number },
): { width: number; height: number } {
  const hPad = opts?.coverOld ? TEXT_COVER_H_PAD : 0;
  const vPad = opts?.coverOld ? TEXT_COVER_V_PAD : 0;
  const lines = text.split("\n");
  const measured = measureMultilineWidth(text, fontSize);
  const width = Math.max(opts?.minWidth ?? 4, measured + hPad * 2 + TEXT_BOX_WIDTH_BUFFER);
  const height = Math.max(fontSize + vPad * 2, lines.length * fontSize + vPad * 2);
  return { width, height };
}

/** Center a tight box vertically inside a looser PDF.js hit rect. */
export function alignBoxToHit(
  hit: { x: number; y: number; width: number; height: number },
  box: { width: number; height: number },
  coverOld: boolean,
): { x: number; y: number; width: number; height: number } {
  const hPad = coverOld ? TEXT_COVER_H_PAD : 0;
  const x = hit.x - hPad;
  const y = hit.y + (hit.height - box.height) / 2;
  return { x, y, width: box.width, height: box.height };
}
