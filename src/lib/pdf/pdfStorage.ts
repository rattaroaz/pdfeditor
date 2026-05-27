import { writeFile } from "@tauri-apps/plugin-fs";
import { invokeLogged } from "@/lib/tauriInvoke";
import { encodeBase64Pdf } from "@/lib/pdf/pdfBinary";
import { log } from "@/lib/logging";

export async function writePdfBytes(
  path: string,
  bytes: Uint8Array,
): Promise<void> {
  if (bytes.byteLength === 0) {
    throw new Error("Cannot save an empty PDF");
  }
  if (bytes[0] !== 0x25) {
    throw new Error("PDF data is invalid (missing %PDF header)");
  }

  // Prefer direct binary write (no base64 IPC overhead)
  try {
    await writeFile(path, bytes);
    log.document.info("Saved PDF via fs plugin", {
      userAction: "save",
      size: bytes.byteLength,
    });
    return;
  } catch (err) {
    log.document.warn("fs writeFile failed, falling back to Rust", {
      userAction: "save",
    });
  }

  await invokeLogged("write_pdf_file", {
    path,
    dataBase64: encodeBase64Pdf(bytes),
  });
}
