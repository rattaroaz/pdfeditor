import { useEffect, useRef, useState } from "react";
import { useDocumentStore } from "@/stores/documentStore";
import { useUiStore } from "@/stores/uiStore";
import {
  acquireScanPages,
  createPdfFromImages,
  importImageFiles,
  insertScannedImages,
  listScanners,
} from "@/services/scanService";
import { reportError } from "@/lib/logging";
import { FULL_SCAN_REGION, PREVIEW_DPI, isFullScanRegion } from "@/lib/scanRegion";
import {
  queueScanPages,
  removeQueuedPage,
  selectedScanImages,
  setAllPagesSelected,
  setPageSelected,
  type QueuedScanPage,
} from "@/lib/scanQueue";
import { ScanPreviewCrop } from "@/components/document/ScanPreviewCrop";
import { ScanPagePicker } from "@/components/document/ScanPagePicker";
import { ImportImageAdjust, type ImportDraft } from "@/components/document/ImportImageAdjust";
import { clampPageInches, IMPORT_SIZE_PRESETS, presetSize } from "@/lib/importImageSize";
import type {
  ScanColorMode,
  ScanPaperSize,
  ScanRegion,
  ScanSource,
  ScannedImage,
  ScannerDevice,
} from "@shared/types";

const DPI_OPTIONS = [150, 200, 300, 600];

export function ScanDialog() {
  const showScanDialog = useUiStore((s) => s.showScanDialog);
  const scanDialogMode = useUiStore((s) => s.scanDialogMode);
  const closeScanDialog = useUiStore((s) => s.closeScanDialog);
  const currentPage = useDocumentStore((s) => s.currentPage);
  const hasDocument = useDocumentStore((s) => !!s.pdfDoc);

  const [scanners, setScanners] = useState<ScannerDevice[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [backend, setBackend] = useState("");
  const [dpi, setDpi] = useState(300);
  const [colorMode, setColorMode] = useState<ScanColorMode>("color");
  const [source, setSource] = useState<ScanSource>("auto");
  const [paperSize, setPaperSize] = useState<ScanPaperSize>("auto");
  const [pages, setPages] = useState<QueuedScanPage[]>([]);
  const [importDrafts, setImportDrafts] = useState<ImportDraft[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ScannedImage | null>(null);
  const [region, setRegion] = useState<ScanRegion>(FULL_SCAN_REGION);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const busyRef = useRef(false);

  const mode = scanDialogMode === "insert" && hasDocument ? "insert" : "new";

  useEffect(() => {
    if (!showScanDialog) return;
    setPages([]);
    setImportDrafts([]);
    setActivePageId(null);
    setPreview(null);
    setRegion(FULL_SCAN_REGION);
    setStatus(null);
    void refreshScanners();
  }, [showScanDialog]);

  const refreshScanners = async () => {
    try {
      const result = await listScanners();
      setScanners(result.scanners);
      setBackend(result.backend);
      setDeviceId((current) => {
        if (current && result.scanners.some((s) => s.id === current)) return current;
        return result.scanners[0]?.id ?? "";
      });
      if (result.scanners.length === 0) {
        setStatus("No scanner found. Import a photo or saved scan of the form.");
      }
    } catch (err) {
      setStatus("Could not list scanners. You can still import images.");
      reportError(err, { category: "assembly", userAction: "list_scanners" });
    }
  };

  if (!showScanDialog) return null;

  const options = { dpi, colorMode, source, paperSize, deviceId: deviceId || undefined };

  const run = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await action();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const handlePreview = () =>
    void run(async () => {
      setStatus("Capturing a low-resolution preview…");
      try {
        const images = await acquireScanPages({
          ...options,
          source: source === "feeder" ? "flatbed" : source,
          preview: true,
          dpi: PREVIEW_DPI,
          maxPages: 1,
        });
        if (images.length === 0) {
          setStatus("Preview cancelled — no page was captured.");
          return;
        }
        setPreview(images[0]);
        setRegion(FULL_SCAN_REGION);
        setStatus("Drag or resize the box to choose the area, then scan it. After the scan, select the page to import.");
      } catch (err) {
        setStatus("Preview failed. Check that the scanner is on and try again.");
        reportError(err, { category: "assembly", userAction: "scan_preview" });
      }
    });

  const handleOfficial = () =>
    void run(async () => {
      const scanRegion = preview ? region : FULL_SCAN_REGION;
      setStatus(
        preview && !isFullScanRegion(scanRegion)
          ? `Scanning selected area at ${dpi} DPI…`
          : `Scanning at ${dpi} DPI…`,
      );
      try {
        const images = await acquireScanPages({
          ...options,
          preview: false,
          region: scanRegion,
          maxPages: 1,
        });
        if (images.length === 0) {
          setStatus("Scan cancelled — no page was captured.");
          return;
        }
        appendPages(images, `Added ${images.length} page(s). Select the page(s) to import, then create the PDF.`);
      } catch (err) {
        setStatus("Scan failed. Check that the scanner is on and try again.");
        reportError(err, { category: "assembly", userAction: "scan_pages" });
      }
    });

  const handleFeeder = () =>
    void run(async () => {
      setStatus("Scanning pages from the feeder…");
      try {
        const images = await acquireScanPages({
          ...options,
          preview: false,
          maxPages: 20,
        });
        if (images.length === 0) {
          setStatus("Scan cancelled — no page was captured.");
          return;
        }
        appendPages(images, `Added ${images.length} page(s). Select the page(s) to import, then create the PDF.`);
      } catch (err) {
        setStatus("Scan failed. Check that the scanner is on and try again.");
        reportError(err, { category: "assembly", userAction: "scan_pages" });
      }
    });

  const handleImport = () =>
    void run(async () => {
      const images = await importImageFiles();
      if (images.length === 0) return;
      setImportDrafts(
        images.map((image) => ({
          id: crypto.randomUUID(),
          image,
        })),
      );
      setStatus("Adjust the crop and PDF page size, then add each image.");
    });

  const advanceImportDrafts = () => {
    setImportDrafts((current) => current.slice(1));
  };

  const appendPages = (images: ScannedImage[], nextStatus: string) => {
    const queued = queueScanPages(images);
    if (queued.length === 0) return;
    setPages((prev) => [...prev, ...queued]);
    setActivePageId(queued[queued.length - 1].id);
    setStatus(nextStatus);
  };

  const handleRemovePage = (id: string) => {
    const remaining = removeQueuedPage(pages, id);
    setPages(remaining);
    setActivePageId((current) => {
      if (current !== id) return current;
      return remaining[remaining.length - 1]?.id ?? null;
    });
    setStatus(remaining.length === 0 ? "Removed the last scanned page." : "Removed a page.");
  };

  const selectedPages = selectedScanImages(pages);

  const handleCreate = () =>
    void run(async () => {
      if (selectedPages.length === 0) {
        setStatus("Select at least one page to import.");
        return;
      }
      const ok =
        mode === "insert"
          ? await insertScannedImages(selectedPages, currentPage, options)
          : await createPdfFromImages(selectedPages, options);
      if (ok) closeScanDialog();
    });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => {
        if (!busy) closeScanDialog();
      }}
    >
      <div
        role="dialog"
        data-testid="scan-dialog"
        aria-labelledby="scan-dialog-title"
        className={`max-h-[90vh] w-full overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-xl ${
          preview || pages.length > 0 || importDrafts.length > 0 ? "max-w-3xl" : "max-w-lg"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="scan-dialog-title" className="text-base font-semibold text-zinc-100">
          {mode === "insert" ? "Insert scanned pages" : "Scan form to PDF"}
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Scan directly, optionally preview and crop first, or import a photo and set its PDF page
          size. Then select which pages to include and create the file.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Scanner</span>
            <div className="flex gap-2">
              <select
                data-testid="scan-device"
                disabled={busy || scanners.length === 0}
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-zinc-200"
              >
                {scanners.length === 0 && <option value="">No scanner detected</option>}
                {scanners.map((scanner) => (
                  <option key={scanner.id} value={scanner.id}>
                    {scanner.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy}
                onClick={() => void refreshScanners()}
                className="rounded-md border border-zinc-600 px-2 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                Refresh
              </button>
            </div>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Color</span>
            <select
              data-testid="scan-color"
              disabled={busy}
              value={colorMode}
              onChange={(e) => setColorMode(e.target.value as ScanColorMode)}
              className="rounded-md border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-zinc-200"
            >
              <option value="color">Color</option>
              <option value="grayscale">Grayscale</option>
              <option value="blackwhite">Black & white</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">DPI</span>
            <select
              data-testid="scan-dpi"
              disabled={busy}
              value={dpi}
              onChange={(e) => setDpi(Number(e.target.value))}
              className="rounded-md border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-zinc-200"
            >
              {DPI_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Source</span>
            <select
              data-testid="scan-source"
              disabled={busy}
              value={source}
              onChange={(e) => {
                const next = e.target.value as ScanSource;
                setSource(next);
                if (next === "feeder") {
                  setPreview(null);
                  setRegion(FULL_SCAN_REGION);
                }
              }}
              className="rounded-md border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-zinc-200"
            >
              <option value="auto">Auto</option>
              <option value="flatbed">Flatbed</option>
              <option value="feeder">Document feeder</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Paper</span>
            <select
              data-testid="scan-paper"
              disabled={busy}
              value={paperSize}
              onChange={(e) => setPaperSize(e.target.value as ScanPaperSize)}
              className="rounded-md border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-zinc-200"
            >
              <option value="auto">Match scan size</option>
              <option value="letter">Letter</option>
              <option value="a4">A4</option>
              <option value="legal">Legal</option>
            </select>
          </label>
        </div>

        {preview && source !== "feeder" && (
          <details className="mt-4" open={pages.length === 0}>
            <summary className="cursor-pointer text-sm text-zinc-300">
              {pages.length === 0 ? "Scan area" : "Adjust scan area for another page"}
            </summary>
            <div className="mt-2">
              <ScanPreviewCrop
                src={`data:${preview.mimeType};base64,${preview.dataBase64}`}
                region={region}
                onChange={setRegion}
                previewDpi={PREVIEW_DPI}
                officialDpi={dpi}
              />
            </div>
          </details>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {source === "feeder" ? (
            <button
              type="button"
              data-testid="scan-page"
              disabled={busy}
              onClick={handleFeeder}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500 disabled:opacity-40"
            >
              Scan feeder
            </button>
          ) : (
            <>
              <button
                type="button"
                data-testid="scan-official"
                disabled={busy}
                onClick={handleOfficial}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500 disabled:opacity-40"
              >
                {preview ? "Scan selected area" : "Scan"}
              </button>
              <button
                type="button"
                data-testid="scan-preview"
                disabled={busy}
                onClick={handlePreview}
                className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
              >
                {preview ? "Retake preview" : "Preview (optional)"}
              </button>
            </>
          )}
          <button
            type="button"
            data-testid="scan-import"
            disabled={busy}
            onClick={handleImport}
            className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
          >
            Import images…
          </button>
          {pages.length > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setPages([]);
                setActivePageId(null);
                setStatus("Cleared scanned pages.");
              }}
              className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800"
            >
              Clear pages
            </button>
          )}
        </div>

        {importDrafts[0] && (
          <ImportImageAdjust
            key={importDrafts[0].id}
            draft={importDrafts[0]}
            remaining={importDrafts.length}
            paperSize={paperSize}
            busy={busy}
            onAdd={(image) => {
              appendPages([image], "Added the image. Select it below, or import another.");
              advanceImportDrafts();
            }}
            onSkip={() => {
              advanceImportDrafts();
              setStatus("Skipped an imported image.");
            }}
          />
        )}

        <ScanPagePicker
          pages={pages}
          activeId={activePageId}
          onActive={setActivePageId}
          onToggle={(id, selected) => setPages((current) => setPageSelected(current, id, selected))}
          onRemove={handleRemovePage}
          onSelectAll={(selected) => setPages((current) => setAllPagesSelected(current, selected))}
        />

        {(() => {
          const active = pages.find((page) => page.id === activePageId);
          if (!active) return null;
          const widthIn = active.image.pageWidthIn ?? 8.5;
          const heightIn = active.image.pageHeightIn ?? 11;
          const setActiveSize = (nextWidth: number, nextHeight: number) => {
            const clamped = clampPageInches(nextWidth, nextHeight);
            setPages((current) =>
              current.map((page) =>
                page.id === activePageId
                  ? {
                      ...page,
                      image: {
                        ...page.image,
                        pageWidthIn: clamped.widthIn,
                        pageHeightIn: clamped.heightIn,
                      },
                    }
                  : page,
              ),
            );
          };
          return (
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm" data-testid="queued-page-size">
              <p className="col-span-2 text-xs text-zinc-400">
                Change the PDF page size for the reviewed page if needed.
              </p>
              <label className="col-span-2 flex flex-col gap-1">
                <span className="text-xs text-zinc-400">Preset</span>
                <select
                  data-testid="queued-size-preset"
                  disabled={busy}
                  defaultValue=""
                  onChange={(event) => {
                    const next = presetSize(
                      event.target.value as (typeof IMPORT_SIZE_PRESETS)[number]["id"],
                      0,
                      0,
                      { x: 0, y: 0, width: 1, height: 1 },
                    );
                    if (next) setActiveSize(next.widthIn, next.heightIn);
                    event.currentTarget.value = "";
                  }}
                  className="rounded-md border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-zinc-200"
                >
                  <option value="" disabled>
                    Apply a preset…
                  </option>
                  {IMPORT_SIZE_PRESETS.filter((item) => item.id !== "custom" && item.id !== "original").map(
                    (item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-400">Width (in)</span>
                <input
                  type="number"
                  min={1}
                  max={22}
                  step={0.01}
                  data-testid="queued-width"
                  disabled={busy}
                  value={Number(widthIn.toFixed(2))}
                  onChange={(event) => setActiveSize(Number(event.target.value), heightIn)}
                  className="rounded-md border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-zinc-200"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-400">Height (in)</span>
                <input
                  type="number"
                  min={1}
                  max={22}
                  step={0.01}
                  data-testid="queued-height"
                  disabled={busy}
                  value={Number(heightIn.toFixed(2))}
                  onChange={(event) => setActiveSize(widthIn, Number(event.target.value))}
                  className="rounded-md border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-zinc-200"
                />
              </label>
            </div>
          );
        })()}

        <p className="mt-3 text-xs text-zinc-500">
          {selectedPages.length} of {pages.length} page{pages.length === 1 ? "" : "s"} selected
          {backend ? ` · ${backend}` : ""}
          {status ? ` · ${status}` : ""}
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={closeScanDialog}
            className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="scan-create"
            disabled={busy || selectedPages.length === 0}
            onClick={handleCreate}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500 disabled:opacity-40"
          >
            {mode === "insert"
              ? `Insert ${selectedPages.length} selected`
              : `Create PDF from ${selectedPages.length} selected`}
          </button>
        </div>
      </div>
    </div>
  );
}
