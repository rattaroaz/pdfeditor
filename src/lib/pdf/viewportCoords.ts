import type { PdfPage } from "./pdfEngine";
import type { Annotation } from "@shared/types";
import type { PageRotation } from "@/stores/documentStore";

export interface ViewportCoordMapper {
  toStorage(displayX: number, displayY: number): { x: number; y: number };
  toDisplay(storageX: number, storageY: number): { x: number; y: number };
  displayRect(
    storageX: number,
    storageY: number,
    storageW: number,
    storageH: number,
  ): { x: number; y: number; width: number; height: number };
}

export function createViewportCoordMapper(
  page: PdfPage,
  viewRotation: PageRotation,
): ViewportCoordMapper {
  if (viewRotation === 0) {
    return {
      toStorage: (x, y) => ({ x, y }),
      toDisplay: (x, y) => ({ x, y }),
      displayRect: (x, y, w, h) => ({ x, y, width: w, height: h }),
    };
  }

  const vp0 = page.getViewport({ scale: 1, rotation: 0 });
  const vpR = page.getViewport({ scale: 1, rotation: viewRotation });

  const toStorage = (displayX: number, displayY: number) => {
    const [pdfX, pdfY] = vpR.convertToPdfPoint(displayX, displayY);
    const [x, y] = vp0.convertToViewportPoint(pdfX, pdfY);
    return { x, y };
  };

  const toDisplay = (storageX: number, storageY: number) => {
    const [pdfX, pdfY] = vp0.convertToPdfPoint(storageX, storageY);
    const [x, y] = vpR.convertToViewportPoint(pdfX, pdfY);
    return { x, y };
  };

  const displayRect = (
    storageX: number,
    storageY: number,
    storageW: number,
    storageH: number,
  ) => {
    const corners = [
      toDisplay(storageX, storageY),
      toDisplay(storageX + storageW, storageY),
      toDisplay(storageX, storageY + storageH),
      toDisplay(storageX + storageW, storageY + storageH),
    ];
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return {
      x: left,
      y: top,
      width: Math.max(...xs) - left,
      height: Math.max(...ys) - top,
    };
  };

  return { toStorage, toDisplay, displayRect };
}

export function rotateViewportPoint(
  x: number,
  y: number,
  pageWidth: number,
  pageHeight: number,
  degrees: 90 | 180 | 270 | -90,
): { x: number; y: number } {
  switch (degrees) {
    case 90:
      return { x: y, y: pageWidth - x };
    case -90:
    case 270:
      return { x: pageHeight - y, y: x };
    case 180:
      return { x: pageWidth - x, y: pageHeight - y };
    default:
      return { x, y };
  }
}

export function rotateViewportRect(
  x: number,
  y: number,
  width: number,
  height: number,
  pageWidth: number,
  pageHeight: number,
  degrees: 90 | 180 | 270 | -90,
): { x: number; y: number; width: number; height: number } {
  const corners = [
    rotateViewportPoint(x, y, pageWidth, pageHeight, degrees),
    rotateViewportPoint(x + width, y, pageWidth, pageHeight, degrees),
    rotateViewportPoint(x, y + height, pageWidth, pageHeight, degrees),
    rotateViewportPoint(x + width, y + height, pageWidth, pageHeight, degrees),
  ];
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function rotateShapeCoords(
  shape: Extract<Annotation, { type: "shape" }>,
  pageWidth: number,
  pageHeight: number,
  degrees: 90 | 180 | 270 | -90,
): { x1: number; y1: number; x2: number; y2: number } {
  const p1 = rotateViewportPoint(shape.x1, shape.y1, pageWidth, pageHeight, degrees);
  const p2 = rotateViewportPoint(shape.x2, shape.y2, pageWidth, pageHeight, degrees);
  return {
    x1: Math.min(p1.x, p2.x),
    y1: Math.min(p1.y, p2.y),
    x2: Math.max(p1.x, p2.x),
    y2: Math.max(p1.y, p2.y),
  };
}

/** Remap stored viewport coordinates after a permanent page /Rotate change. */
export function rotateAnnotationForPage(
  annotation: Annotation,
  pageWidth: number,
  pageHeight: number,
  degrees: 90 | 180 | 270 | -90,
): Annotation {
  switch (annotation.type) {
    case "highlight":
    case "underline":
    case "strikeout":
      return {
        ...annotation,
        rects: annotation.rects.map((rect) =>
          rotateViewportRect(rect.x, rect.y, rect.width, rect.height, pageWidth, pageHeight, degrees),
        ),
      };
    case "freehand":
      return {
        ...annotation,
        points: annotation.points.map((point) =>
          rotateViewportPoint(point.x, point.y, pageWidth, pageHeight, degrees),
        ),
      };
    case "text":
      return {
        ...annotation,
        ...rotateViewportRect(
          annotation.x,
          annotation.y,
          annotation.width,
          annotation.height,
          pageWidth,
          pageHeight,
          degrees,
        ),
      };
    case "note":
    case "stamp": {
      const point = rotateViewportPoint(annotation.x, annotation.y, pageWidth, pageHeight, degrees);
      return { ...annotation, x: point.x, y: point.y };
    }
    case "shape":
      return { ...annotation, ...rotateShapeCoords(annotation, pageWidth, pageHeight, degrees) };
    default:
      return annotation;
  }
}
