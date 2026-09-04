import type { ScanRegion } from "@shared/types";

export const FULL_SCAN_REGION: ScanRegion = { x: 0, y: 0, width: 1, height: 1 };
export const PREVIEW_DPI = 75;
const MIN_SIDE = 0.04;

export function clampScanRegion(region: ScanRegion): ScanRegion {
  const width = Math.min(1, Math.max(MIN_SIDE, region.width));
  const height = Math.min(1, Math.max(MIN_SIDE, region.height));
  const x = Math.min(Math.max(0, region.x), 1 - width);
  const y = Math.min(Math.max(0, region.y), 1 - height);
  return { x, y, width, height };
}

export function isFullScanRegion(region: ScanRegion): boolean {
  return (
    region.x <= 0.005 &&
    region.y <= 0.005 &&
    region.width >= 0.995 &&
    region.height >= 0.995
  );
}

export function regionFromDrag(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  imageWidth: number,
  imageHeight: number,
): ScanRegion {
  if (imageWidth <= 0 || imageHeight <= 0) return { ...FULL_SCAN_REGION };
  const x1 = Math.min(startX, endX) / imageWidth;
  const y1 = Math.min(startY, endY) / imageHeight;
  const x2 = Math.max(startX, endX) / imageWidth;
  const y2 = Math.max(startY, endY) / imageHeight;
  return clampScanRegion({
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
  });
}

export function describeScanInches(
  region: ScanRegion,
  previewWidthPx: number,
  previewHeightPx: number,
  previewDpi: number,
): { widthIn: number; heightIn: number } {
  const dpi = Math.max(1, previewDpi);
  return {
    widthIn: (region.width * previewWidthPx) / dpi,
    heightIn: (region.height * previewHeightPx) / dpi,
  };
}

export function officialPixelSize(
  region: ScanRegion,
  previewWidthPx: number,
  previewHeightPx: number,
  previewDpi: number,
  officialDpi: number,
): { width: number; height: number } {
  const inches = describeScanInches(region, previewWidthPx, previewHeightPx, previewDpi);
  return {
    width: Math.round(inches.widthIn * officialDpi),
    height: Math.round(inches.heightIn * officialDpi),
  };
}
