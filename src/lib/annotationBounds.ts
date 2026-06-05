import type { Annotation, FreehandAnnotation, RectAnnotation, ShapeAnnotation } from "@shared/types";

const STAMP_DEFAULT_WIDTH = 120;
const STAMP_DEFAULT_HEIGHT = 30;
const NOTE_SIZE = 20;
export interface PdfBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function unionBounds(boxes: PdfBounds[]): PdfBounds {
  if (boxes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = boxes[0]!.x;
  let minY = boxes[0]!.y;
  let maxX = boxes[0]!.x + boxes[0]!.width;
  let maxY = boxes[0]!.y + boxes[0]!.height;
  for (const box of boxes.slice(1)) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Bounding box for an annotation in PDF page coordinates (viewer layer space). */
export function annotationBounds(ann: Annotation): PdfBounds {
  switch (ann.type) {
    case "note":
      return {
        x: ann.x - NOTE_SIZE / 2,
        y: ann.y - NOTE_SIZE / 2,
        width: NOTE_SIZE,
        height: NOTE_SIZE,
      };
    case "text":
      return { x: ann.x, y: ann.y, width: ann.width, height: ann.height };
    case "stamp": {
      const w = ann.width ?? STAMP_DEFAULT_WIDTH;
      const h = ann.height ?? STAMP_DEFAULT_HEIGHT;
      return { x: ann.x, y: ann.y, width: w, height: h };
    }
    case "highlight":
    case "underline":
    case "strikeout":
      return unionBounds((ann as RectAnnotation).rects);
    case "freehand": {
      const fh = ann as FreehandAnnotation;
      if (fh.points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
      let minX = fh.points[0]!.x;
      let minY = fh.points[0]!.y;
      let maxX = fh.points[0]!.x;
      let maxY = fh.points[0]!.y;
      for (const p of fh.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      const pad = fh.strokeWidth;
      return {
        x: minX - pad,
        y: minY - pad,
        width: maxX - minX + pad * 2,
        height: maxY - minY + pad * 2,
      };
    }
    case "shape": {
      const shape = ann as ShapeAnnotation;
      const x = Math.min(shape.x1, shape.x2);
      const y = Math.min(shape.y1, shape.y2);
      return {
        x,
        y,
        width: Math.abs(shape.x2 - shape.x1),
        height: Math.abs(shape.y2 - shape.y1),
      };
    }
    default:
      return { x: 0, y: 0, width: 0, height: 0 };
  }
}

export function annotationCenter(ann: Annotation): { x: number; y: number } {
  const b = annotationBounds(ann);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
