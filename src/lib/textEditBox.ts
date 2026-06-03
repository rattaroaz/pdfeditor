/** Horizontal padding for PDF white-out cover (PDF points). */
export const TEXT_COVER_H_PAD = 1;
/** Vertical padding for PDF white-out cover (PDF points). */
export const TEXT_COVER_V_PAD = 0.5;

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

export function computeTextEditBox(
  text: string,
  fontSize: number,
  opts?: { coverOld?: boolean; minWidth?: number },
): { width: number; height: number } {
  const hPad = opts?.coverOld ? TEXT_COVER_H_PAD : 0;
  const vPad = opts?.coverOld ? TEXT_COVER_V_PAD : 0;
  const measured = measureTextWidth(text, fontSize);
  const width = Math.max(opts?.minWidth ?? 4, measured + hPad * 2);
  const height = fontSize + vPad * 2;
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
