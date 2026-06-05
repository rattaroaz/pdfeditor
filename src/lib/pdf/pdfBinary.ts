export function decodeBase64Pdf(base64: string): Uint8Array {
  const normalized = base64.replace(/\s/g, "");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Safe for large PDFs — avoids spread/stack overflow in String.fromCharCode */
export function encodeBase64Pdf(bytes: Uint8Array): string {
  const chunkSize = 8192;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, bytes.length);
    let chunk = "";
    for (let j = i; j < end; j++) {
      chunk += String.fromCharCode(bytes[j]!);
    }
    parts.push(chunk);
  }
  return btoa(parts.join(""));
}

export function ensurePdfExtension(path: string): string {
  return path.toLowerCase().endsWith(".pdf") ? path : `${path}.pdf`;
}

/** Last path segment of a file path (handles both `/` and `\` separators). */
export function fileNameFromPath(path: string, fallback = "document.pdf"): string {
  const name = path.split(/[/\\]/).pop();
  return name && name.length > 0 ? name : fallback;
}

/** Standard result shape for Rust commands that return base64-encoded PDF bytes. */
export interface PdfBytesResult {
  dataBase64: string;
}
