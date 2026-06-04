import type {
  Annotation,
  FreehandAnnotation,
  NoteAnnotation,
  RectAnnotation,
  ShapeAnnotation,
  StampAnnotation,
  TextAnnotation,
} from "@shared/types";

const STAMP_WIDTH = 120;
const STAMP_HEIGHT = 30;
const NOTE_RADIUS = 10;
const HIT_PADDING = 4;

function pointInRect(
  x: number,
  y: number,
  rx: number,
  ry: number,
  width: number,
  height: number,
  padding = 0,
): boolean {
  return (
    x >= rx - padding &&
    x <= rx + width + padding &&
    y >= ry - padding &&
    y <= ry + height + padding
  );
}

function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    return Math.hypot(px - x1, py - y1);
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function hitShape(shape: ShapeAnnotation, x: number, y: number): boolean {
  const { x1, y1, x2, y2, shape: kind } = shape;
  if (kind === "rectangle") {
    const rx = Math.min(x1, x2);
    const ry = Math.min(y1, y2);
    return pointInRect(x, y, rx, ry, Math.abs(x2 - x1), Math.abs(y2 - y1), HIT_PADDING);
  }
  if (kind === "ellipse") {
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const rx = Math.abs(x2 - x1) / 2 + HIT_PADDING;
    const ry = Math.abs(y2 - y1) / 2 + HIT_PADDING;
    if (rx === 0 || ry === 0) return false;
    const nx = (x - cx) / rx;
    const ny = (y - cy) / ry;
    return nx * nx + ny * ny <= 1;
  }
  return distToSegment(x, y, x1, y1, x2, y2) <= shape.strokeWidth + HIT_PADDING;
}

function hitFreehand(fh: FreehandAnnotation, x: number, y: number): boolean {
  if (fh.points.length < 2) return false;
  const threshold = fh.strokeWidth + HIT_PADDING;
  for (let i = 1; i < fh.points.length; i++) {
    const a = fh.points[i - 1];
    const b = fh.points[i];
    if (distToSegment(x, y, a.x, a.y, b.x, b.y) <= threshold) return true;
  }
  return false;
}

/** Returns the topmost annotation at the given page-local coordinates. */
export function hitTestAnnotation(
  annotations: Annotation[],
  pageIndex: number,
  x: number,
  y: number,
): Annotation | null {
  const pageAnnotations = annotations.filter((a) => a.pageIndex === pageIndex);
  for (let i = pageAnnotations.length - 1; i >= 0; i--) {
    const ann = pageAnnotations[i];
    if (ann.type === "note") {
      const note = ann as NoteAnnotation;
      if (Math.hypot(x - note.x, y - note.y) <= NOTE_RADIUS + HIT_PADDING) return ann;
    }
    if (ann.type === "stamp") {
      const stamp = ann as StampAnnotation;
      if (pointInRect(x, y, stamp.x, stamp.y, STAMP_WIDTH, STAMP_HEIGHT, HIT_PADDING)) {
        return ann;
      }
    }
    if (ann.type === "text") {
      const text = ann as TextAnnotation;
      if (pointInRect(x, y, text.x, text.y, text.width, text.height, HIT_PADDING)) {
        return ann;
      }
    }
    if (ann.type === "highlight" || ann.type === "underline" || ann.type === "strikeout") {
      for (const r of (ann as RectAnnotation).rects) {
        if (pointInRect(x, y, r.x, r.y, r.width, r.height, HIT_PADDING)) return ann;
      }
    }
    if (ann.type === "freehand" && hitFreehand(ann as FreehandAnnotation, x, y)) return ann;
    if (ann.type === "shape" && hitShape(ann as ShapeAnnotation, x, y)) return ann;
  }
  return null;
}

export const MARKUP_COLOR: Record<"highlight" | "underline" | "strikeout", string> = {
  highlight: "#FFEB3B",
  underline: "#2196F3",
  strikeout: "#F44336",
};

/** Default vertical extent for underline/strikeout when the user drags mostly horizontally. */
export const MARKUP_LINE_HEIGHT = 16;

export type MarkupRectKind = keyof typeof MARKUP_COLOR;

export function normalizeMarkupRect(
  start: { x: number; y: number },
  end: { x: number; y: number },
  kind: MarkupRectKind,
): { x: number; y: number; width: number; height: number } | null {
  const x = Math.min(start.x, end.x);
  let y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  let height = Math.abs(end.y - start.y);

  if (kind === "highlight") {
    if (width < 4 || height < 4) return null;
    return { x, y, width, height };
  }

  // Underline and strikeout are line gestures — allow a thin vertical drag.
  if (width < 4) return null;
  if (height < 4) {
    const midY = (start.y + end.y) / 2;
    height = MARKUP_LINE_HEIGHT;
    y = midY - height / 2;
  }
  return { x, y, width, height };
}

/** Line thickness in page units for underline/strikeout rendering. */
export const MARKUP_LINE_THICKNESS = 3;

export function lineMarkupBandY(
  r: { y: number; height: number },
  kind: "underline" | "strikeout",
): number {
  if (kind === "underline") {
    return r.y + r.height - MARKUP_LINE_THICKNESS;
  }
  return r.y + r.height / 2 - MARKUP_LINE_THICKNESS / 2;
}
