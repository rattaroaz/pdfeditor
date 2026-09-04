import { useState } from "react";
import type { ScanPaperSize, ScanRegion, ScannedImage } from "@shared/types";
import { FULL_SCAN_REGION } from "@/lib/scanRegion";
import {
  clampPageInches,
  cropAspect,
  cropScannedImage,
  defaultImportSize,
  imageSrc,
  IMPORT_SIZE_DPI,
  IMPORT_SIZE_PRESETS,
  presetSize,
  scalePageSize,
  withAspect,
  type ImportSizePreset,
} from "@/lib/importImageSize";
import { ScanPreviewCrop } from "./ScanPreviewCrop";

export interface ImportDraft {
  id: string;
  image: ScannedImage;
}

export function ImportImageAdjust({
  draft,
  remaining,
  paperSize,
  busy,
  onAdd,
  onSkip,
}: {
  draft: ImportDraft;
  remaining: number;
  paperSize: ScanPaperSize;
  busy: boolean;
  onAdd: (image: ScannedImage) => void;
  onSkip: () => void;
}) {
  const [region, setRegion] = useState<ScanRegion>(FULL_SCAN_REGION);
  const [preset, setPreset] = useState<ImportSizePreset>(paperSize === "auto" ? "letter" : paperSize);
  const [size, setSize] = useState(() => defaultImportSize(paperSize));
  const [baseSize, setBaseSize] = useState(() => defaultImportSize(paperSize));
  const [scale, setScale] = useState(100);
  const [lockAspect, setLockAspect] = useState(true);
  const [imagePx, setImagePx] = useState({ width: 0, height: 0 });

  const applyPreset = (next: ImportSizePreset, widthPx = imagePx.width, heightPx = imagePx.height) => {
    setPreset(next);
    const fromPreset = presetSize(next, widthPx, heightPx, region);
    if (fromPreset) {
      const clamped = clampPageInches(fromPreset.widthIn, fromPreset.heightIn);
      setSize(clamped);
      setBaseSize(clamped);
      setScale(100);
    }
  };

  const changeSide = (side: "width" | "height", value: number) => {
    setPreset("custom");
    const aspect = cropAspect(imagePx.width || 850, imagePx.height || 1100, region);
    const next = lockAspect
      ? withAspect(side === "width" ? value : size.widthIn, side === "height" ? value : size.heightIn, side, aspect)
      : clampPageInches(side === "width" ? value : size.widthIn, side === "height" ? value : size.heightIn);
    setSize(next);
    setBaseSize(next);
    setScale(100);
  };

  const handleAdd = () =>
    void (async () => {
      const cropped = await cropScannedImage(draft.image, region);
      onAdd({
        ...cropped,
        pageWidthIn: size.widthIn,
        pageHeightIn: size.heightIn,
      });
    })();

  return (
    <section className="mt-4 space-y-3" data-testid="import-adjust">
      <h3 className="text-sm font-medium text-zinc-100">
        Adjust imported image{remaining > 1 ? ` (1 of ${remaining})` : ""}
      </h3>
      <p className="text-xs text-zinc-500">
        Crop the photo if needed, then set the PDF page size. The image is fitted to that page.
      </p>
      <ScanPreviewCrop
        src={imageSrc(draft.image)}
        region={region}
        onChange={setRegion}
        previewDpi={IMPORT_SIZE_DPI}
        officialDpi={IMPORT_SIZE_DPI}
        hint={`Drag to crop. PDF page will be ${size.widthIn.toFixed(2)} × ${size.heightIn.toFixed(2)} in.`}
        onImageSize={(width, height) => {
          setImagePx({ width, height });
          if (preset === "original") applyPreset("original", width, height);
        }}
      />
      <div className="grid grid-cols-2 gap-3 text-sm">
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-xs text-zinc-400">PDF page size</span>
          <select
            data-testid="import-size-preset"
            disabled={busy}
            value={preset}
            onChange={(event) => applyPreset(event.target.value as ImportSizePreset)}
            className="rounded-md border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-zinc-200"
          >
            {IMPORT_SIZE_PRESETS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">Width (in)</span>
          <input
            type="number"
            min={1}
            max={22}
            step={0.01}
            data-testid="import-width"
            disabled={busy}
            value={Number(size.widthIn.toFixed(2))}
            onChange={(event) => changeSide("width", Number(event.target.value))}
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
            data-testid="import-height"
            disabled={busy}
            value={Number(size.heightIn.toFixed(2))}
            onChange={(event) => changeSide("height", Number(event.target.value))}
            className="rounded-md border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-zinc-200"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            data-testid="import-lock-aspect"
            checked={lockAspect}
            onChange={(event) => setLockAspect(event.target.checked)}
          />
          Lock aspect
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">Scale ({scale}%)</span>
          <input
            type="range"
            min={50}
            max={150}
            step={5}
            data-testid="import-scale"
            disabled={busy}
            value={scale}
            onChange={(event) => {
              const percent = Number(event.target.value);
              setScale(percent);
              setPreset("custom");
              setSize(scalePageSize(baseSize.widthIn, baseSize.heightIn, percent));
            }}
            className="mt-2"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="import-add-page"
          disabled={busy}
          onClick={handleAdd}
          className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm text-white hover:bg-emerald-600 disabled:opacity-40"
        >
          Add this image
        </button>
        <button
          type="button"
          data-testid="import-skip"
          disabled={busy}
          onClick={onSkip}
          className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          Skip
        </button>
      </div>
    </section>
  );
}
