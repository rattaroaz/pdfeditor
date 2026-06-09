import type { PdfPage } from "./pdfEngine";
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
