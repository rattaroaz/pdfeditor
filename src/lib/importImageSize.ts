import type { ScanPaperSize, ScanRegion, ScannedImage } from "@shared/types";
import { describeScanInches, isFullScanRegion } from "./scanRegion";

export const IMPORT_SIZE_DPI = 150;

export const PAPER_INCHES: Record<Exclude<ScanPaperSize, "auto">, { widthIn: number; heightIn: number }> =
  {
    letter: { widthIn: 8.5, heightIn: 11 },
    a4: { widthIn: 8.27, heightIn: 11.69 },
    legal: { widthIn: 8.5, heightIn: 14 },
  };

export type ImportSizePreset = "letter" | "a4" | "legal" | "original" | "4x6" | "5x7" | "custom";

export const IMPORT_SIZE_PRESETS: { id: ImportSizePreset; label: string }[] = [
  { id: "letter", label: "Letter (8.5 × 11 in)" },
  { id: "a4", label: "A4 (8.27 × 11.69 in)" },
  { id: "legal", label: "Legal (8.5 × 14 in)" },
  { id: "4x6", label: "4 × 6 in" },
  { id: "5x7", label: "5 × 7 in" },
  { id: "original", label: "Match image pixels" },
  { id: "custom", label: "Custom size" },
];

export function defaultImportSize(paperSize: ScanPaperSize): { widthIn: number; heightIn: number } {
  if (paperSize !== "auto") return { ...PAPER_INCHES[paperSize] };
  return { ...PAPER_INCHES.letter };
}

export function presetSize(
  preset: ImportSizePreset,
  imageWidthPx: number,
  imageHeightPx: number,
  region: ScanRegion,
): { widthIn: number; heightIn: number } | null {
  switch (preset) {
    case "letter":
      return { ...PAPER_INCHES.letter };
    case "a4":
      return { ...PAPER_INCHES.a4 };
    case "legal":
      return { ...PAPER_INCHES.legal };
    case "4x6":
      return { widthIn: 4, heightIn: 6 };
    case "5x7":
      return { widthIn: 5, heightIn: 7 };
    case "original":
      return describeScanInches(region, imageWidthPx, imageHeightPx, IMPORT_SIZE_DPI);
    case "custom":
      return null;
  }
}

export function clampPageInches(widthIn: number, heightIn: number): { widthIn: number; heightIn: number } {
  return {
    widthIn: Math.min(22, Math.max(1, Number.isFinite(widthIn) ? widthIn : 8.5)),
    heightIn: Math.min(22, Math.max(1, Number.isFinite(heightIn) ? heightIn : 11)),
  };
}

export function scalePageSize(
  widthIn: number,
  heightIn: number,
  percent: number,
): { widthIn: number; heightIn: number } {
  const factor = Math.min(3, Math.max(0.25, percent / 100));
  return clampPageInches(widthIn * factor, heightIn * factor);
}

export function withAspect(
  widthIn: number,
  heightIn: number,
  changed: "width" | "height",
  aspect: number,
): { widthIn: number; heightIn: number } {
  const safeAspect = aspect > 0.05 && aspect < 20 ? aspect : 8.5 / 11;
  if (changed === "width") {
    return clampPageInches(widthIn, widthIn / safeAspect);
  }
  return clampPageInches(heightIn * safeAspect, heightIn);
}

export function cropAspect(
  imageWidthPx: number,
  imageHeightPx: number,
  region: ScanRegion,
): number {
  const width = Math.max(1, region.width * imageWidthPx);
  const height = Math.max(1, region.height * imageHeightPx);
  return width / height;
}

export function imageSrc(image: ScannedImage): string {
  return `data:${image.mimeType};base64,${image.dataBase64}`;
}

export async function cropScannedImage(
  image: ScannedImage,
  region: ScanRegion,
): Promise<ScannedImage> {
  if (isFullScanRegion(region)) return image;
  const element = await loadHtmlImage(imageSrc(image));
  const sx = Math.round(region.x * element.naturalWidth);
  const sy = Math.round(region.y * element.naturalHeight);
  const sw = Math.max(1, Math.round(region.width * element.naturalWidth));
  const sh = Math.max(1, Math.round(region.height * element.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return image;
  ctx.drawImage(element, sx, sy, sw, sh, 0, 0, sw, sh);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  const dataBase64 = dataUrl.split(",")[1] ?? "";
  if (!dataBase64) return image;
  return { dataBase64, mimeType: "image/jpeg" };
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read the imported image"));
    img.src = src;
  });
}
