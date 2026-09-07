import type { ScannedImage } from "@shared/types";

function cleanBase64(dataBase64: string): string {
  return dataBase64.replace(/\s/g, "");
}

function displayMime(mimeType: string | undefined): string {
  if (!mimeType || mimeType === "application/octet-stream") return "image/jpeg";
  return mimeType;
}

export function scannedImageSrc(image: Pick<ScannedImage, "dataBase64" | "mimeType">): string {
  return `data:${displayMime(image.mimeType)};base64,${cleanBase64(image.dataBase64)}`;
}

export function createScannedImageObjectUrl(
  image: Pick<ScannedImage, "dataBase64" | "mimeType">,
): string | null {
  try {
    const cleaned = cleanBase64(image.dataBase64);
    if (!cleaned) return null;
    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    if (bytes.length === 0) return null;
    return URL.createObjectURL(new Blob([bytes], { type: displayMime(image.mimeType) }));
  } catch {
    return null;
  }
}
