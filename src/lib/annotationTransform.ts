import type {
  Annotation,
  FreehandAnnotation,
  RectAnnotation,
  ShapeAnnotation,
  StampAnnotation,
  TextAnnotation,
} from "@shared/types";
import { annotationBounds, type PdfBounds } from "@/lib/annotationBounds";
import { markupBoxHeightFromFontSize, markupFontSizeFromBoxHeight } from "@/lib/textEditBox";

export const STAMP_DEFAULT_WIDTH = 120;
export const STAMP_DEFAULT_HEIGHT = 30;
export const MIN_ANNOTATION_SIZE = 8;
export const RESIZE_HANDLE_PX = 8;

export function stampSize(stamp: StampAnnotation): { width: number; height: number } {
  return {
    width: stamp.width ?? STAMP_DEFAULT_WIDTH,
    height: stamp.height ?? STAMP_DEFAULT_HEIGHT,
  };
}

export function canResizeAnnotation(ann: Annotation): boolean {
  return (
    ann.type === "text" ||
    ann.type === "shape" ||
    ann.type === "highlight" ||
    ann.type === "underline" ||
    ann.type === "strikeout" ||
    ann.type === "freehand" ||
    ann.type === "stamp"
  );
}

export function hitTestResizeHandle(
  ann: Annotation,
  x: number,
  y: number,
  scale: number,
): boolean {
  if (!canResizeAnnotation(ann)) return false;
  const b = annotationBounds(ann);
  if (b.width < MIN_ANNOTATION_SIZE || b.height < MIN_ANNOTATION_SIZE) {
    // thin shapes still get a handle at the primary endpoint
    if (ann.type !== "shape") return false;
  }
  const tol = RESIZE_HANDLE_PX / scale;
  const hx = b.x + b.width;
  const hy = b.y + b.height;
  return x >= hx - tol && x <= hx + tol && y >= hy - tol && y <= hy + tol;
}

export function moveAnnotation(ann: Annotation, dx: number, dy: number): Annotation {
  if (dx === 0 && dy === 0) return ann;

  switch (ann.type) {
    case "note":
    case "stamp":
      return { ...ann, x: ann.x + dx, y: ann.y + dy };
    case "text":
      return { ...ann, x: ann.x + dx, y: ann.y + dy };
    case "highlight":
    case "underline":
    case "strikeout":
      return {
        ...ann,
        rects: (ann as RectAnnotation).rects.map((r) => ({
          ...r,
          x: r.x + dx,
          y: r.y + dy,
        })),
      };
    case "freehand":
      return {
        ...ann,
        points: (ann as FreehandAnnotation).points.map((p) => ({
          x: p.x + dx,
          y: p.y + dy,
        })),
      };
    case "shape":
      return {
        ...ann,
        x1: ann.x1 + dx,
        y1: ann.y1 + dy,
        x2: ann.x2 + dx,
        y2: ann.y2 + dy,
      };
    default:
      return ann;
  }
}

export function resizeAnnotation(
  ann: Annotation,
  anchor: PdfBounds,
  pointerX: number,
  pointerY: number,
): Annotation {
  switch (ann.type) {
    case "text": {
      const width = Math.max(MIN_ANNOTATION_SIZE, pointerX - anchor.x);
      const centerY = anchor.y + anchor.height / 2;
      const rawHeight = Math.max(MIN_ANNOTATION_SIZE, 2 * (pointerY - centerY));
      const fontSize = markupFontSizeFromBoxHeight(rawHeight);
      const height = markupBoxHeightFromFontSize(fontSize);
      const y = centerY - height / 2;
      return { ...(ann as TextAnnotation), x: anchor.x, y, width, height, fontSize };
    }
    case "stamp": {
      const width = Math.max(MIN_ANNOTATION_SIZE, pointerX - anchor.x);
      const height = Math.max(MIN_ANNOTATION_SIZE, pointerY - anchor.y);
      return {
        ...(ann as StampAnnotation),
        x: anchor.x,
        y: anchor.y,
        width,
        height,
      };
    }
    case "highlight":
    case "underline":
    case "strikeout": {
      const width = Math.max(MIN_ANNOTATION_SIZE, pointerX - anchor.x);
      const height = Math.max(MIN_ANNOTATION_SIZE, pointerY - anchor.y);
      return {
        ...ann,
        rects: [{ x: anchor.x, y: anchor.y, width, height }],
      };
    }
    case "freehand": {
      const fh = ann as FreehandAnnotation;
      const width = Math.max(MIN_ANNOTATION_SIZE, pointerX - anchor.x);
      const height = Math.max(MIN_ANNOTATION_SIZE, pointerY - anchor.y);
      const sx = anchor.width > 0 ? width / anchor.width : 1;
      const sy = anchor.height > 0 ? height / anchor.height : 1;
      return {
        ...fh,
        points: fh.points.map((p) => ({
          x: anchor.x + (p.x - anchor.x) * sx,
          y: anchor.y + (p.y - anchor.y) * sy,
        })),
      };
    }
    case "shape": {
      const shape = ann as ShapeAnnotation;
      if (shape.shape === "line" || shape.shape === "arrow") {
        return { ...shape, x2: pointerX, y2: pointerY };
      }
      const width = Math.max(MIN_ANNOTATION_SIZE, pointerX - anchor.x);
      const height = Math.max(MIN_ANNOTATION_SIZE, pointerY - anchor.y);
      return {
        ...shape,
        x1: anchor.x,
        y1: anchor.y,
        x2: anchor.x + width,
        y2: anchor.y + height,
      };
    }
    default:
      return ann;
  }
}
