import { open } from "@tauri-apps/plugin-dialog";
import { invokeLogged } from "@/lib/tauriInvoke";
import { decodeBase64Pdf, loadPdfFromBytes } from "@/lib/pdf/pdfEngine";
import type { PdfBytesResult } from "@/lib/pdf/pdfBinary";
import { normalizeDialogPaths } from "@/lib/dialogPaths";
import { requireTauriDesktop } from "@/lib/tauriRuntime";
import { createErrorReporter, log } from "@/lib/logging";
import { runDocumentOperation } from "@/services/documentOpQueue";
import { confirmDiscardDocumentChanges } from "@/services/documentService";
import { insertImagePages } from "@/services/pageService";
import { useDocumentStore } from "@/stores/documentStore";
import { useAnnotationStore } from "@/stores/annotationStore";
import { useContentEditStore } from "@/stores/contentEditStore";
import { useFormStore } from "@/stores/formStore";
import { clearHistory } from "@/stores/historyStore";
import { PREVIEW_DPI } from "@/lib/scanRegion";
import type { ScanOptions, ScannedImage, ScannerDevice } from "@shared/types";

const showError = createErrorReporter("assembly", "scan");

export interface ListScannersResult {
  scanners: ScannerDevice[];
  backend: string;
}

export interface ScanPagesResult {
  images: ScannedImage[];
  cancelled: boolean;
}

export interface ReadImageFileResult {
  dataBase64: string;
  mimeType: string;
  path: string;
}

const DEFAULT_OPTIONS: ScanOptions = {
  dpi: 300,
  colorMode: "color",
  source: "auto",
  paperSize: "auto",
};

function scannedFileName(): string {
  const date = new Date().toISOString().slice(0, 10);
  return `Scanned-form-${date}.pdf`;
}

function clearOverlaysAfterNewScan(): void {
  useAnnotationStore.getState().clearAnnotations();
  useContentEditStore.getState().clearEdits();
  useFormStore.getState().clearFormState();
  clearHistory();
}

export async function listScanners(): Promise<ListScannersResult> {
  requireTauriDesktop("Scanner");
  return invokeLogged<ListScannersResult>("list_scanners");
}

export async function acquireScanPages(
  options: Partial<ScanOptions> = {},
): Promise<ScannedImage[]> {
  requireTauriDesktop("Scanner");
  const merged = { ...DEFAULT_OPTIONS, ...options };
  const region = merged.region ?? { x: 0, y: 0, width: 1, height: 1 };
  const result = await invokeLogged<ScanPagesResult>("scan_pages", {
    dpi: merged.preview ? PREVIEW_DPI : merged.dpi,
    colorMode: merged.colorMode,
    source: merged.source,
    deviceId: merged.deviceId,
    maxPages: merged.maxPages ?? (merged.source === "feeder" ? 20 : 1),
    preview: merged.preview ?? false,
    regionX: region.x,
    regionY: region.y,
    regionWidth: region.width,
    regionHeight: region.height,
  });
  if (result.images.length > 0) return result.images;
  if (result.cancelled) return [];
  return result.images;
}

export async function importImageFiles(): Promise<ScannedImage[]> {
  requireTauriDesktop("Import images");
  const selected = await open({
    multiple: true,
    directory: false,
    filters: [
      { name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff"] },
    ],
  });
  const paths = normalizeDialogPaths(selected);
  const images: ScannedImage[] = [];
  for (const path of paths) {
    const result = await invokeLogged<ReadImageFileResult>("read_image_file", { path });
    images.push({ dataBase64: result.dataBase64, mimeType: result.mimeType });
  }
  return images;
}

async function openScannedDocument(bytes: Uint8Array, fileName: string): Promise<void> {
  const pdfDoc = await loadPdfFromBytes(bytes);
  const docStore = useDocumentStore.getState();
  docStore.setDocument({
    filePath: "",
    fileName,
    pdfDoc,
    pdfBytes: bytes,
    metadata: {
      pageCount: pdfDoc.numPages,
      fileSize: bytes.byteLength,
    },
  });
  docStore.markDocumentChanged("scan");
  clearOverlaysAfterNewScan();
  docStore.setStatusMessage(`Opened ${pdfDoc.numPages} scanned page(s)`);
}

export async function createPdfFromImages(
  images: ScannedImage[],
  options: Partial<ScanOptions> = {},
): Promise<boolean> {
  if (images.length === 0) return false;
  if (
    !(await confirmDiscardDocumentChanges(
      "You have unsaved changes. Replace the open document with the scanned PDF?",
    ))
  ) {
    return false;
  }

  const merged = { ...DEFAULT_OPTIONS, ...options };
  return runDocumentOperation("scan_to_pdf", async () => {
    const docStore = useDocumentStore.getState();
    docStore.setLoading(true);
    try {
      const result = await invokeLogged<PdfBytesResult>("images_to_pdf", {
        images,
        dpi: merged.dpi,
        paperSize: merged.paperSize,
      });
      const bytes = decodeBase64Pdf(result.dataBase64);
      await openScannedDocument(bytes, scannedFileName());
      log.assembly.info("Created PDF from scanned images", {
        userAction: "scan_to_pdf",
        metadata: { pages: images.length, dpi: merged.dpi },
      });
      return true;
    } catch (err) {
      showError(err);
      return false;
    } finally {
      docStore.setLoading(false);
    }
  });
}

export async function insertScannedImages(
  images: ScannedImage[],
  afterPage: number,
  options: Partial<ScanOptions> = {},
): Promise<boolean> {
  if (images.length === 0) return false;
  const sourceBytes =
    useDocumentStore.getState().basePdfBytes ?? useDocumentStore.getState().pdfBytes;
  if (!sourceBytes) {
    return createPdfFromImages(images, options);
  }

  const merged = { ...DEFAULT_OPTIONS, ...options };
  try {
    await insertImagePages(afterPage, images, merged.dpi, merged.paperSize);
    useDocumentStore.getState().setStatusMessage(`Inserted ${images.length} scanned page(s)`);
    log.assembly.info("Inserted scanned pages", {
      userAction: "insert_scan",
      metadata: { pages: images.length, afterPage },
    });
    return true;
  } catch {
    return false;
  }
}

