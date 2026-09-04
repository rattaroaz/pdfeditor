import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ScanRegion } from "@shared/types";
import {
  clampScanRegion,
  describeScanInches,
  officialPixelSize,
  regionFromDrag,
} from "@/lib/scanRegion";

type Handle = "draw" | "move" | "nw" | "ne" | "sw" | "se";

function clientToImage(
  event: { clientX: number; clientY: number },
  image: HTMLImageElement,
): { x: number; y: number } {
  const rect = image.getBoundingClientRect();
  const scaleX = image.naturalWidth / rect.width;
  const scaleY = image.naturalHeight / rect.height;
  return {
    x: Math.min(Math.max(0, (event.clientX - rect.left) * scaleX), image.naturalWidth),
    y: Math.min(Math.max(0, (event.clientY - rect.top) * scaleY), image.naturalHeight),
  };
}

export function ScanPreviewCrop({
  src,
  region,
  onChange,
  previewDpi,
  officialDpi,
  hint,
  onImageSize,
}: {
  src: string;
  region: ScanRegion;
  onChange: (region: ScanRegion) => void;
  previewDpi: number;
  officialDpi: number;
  hint?: string;
  onImageSize?: (width: number, height: number) => void;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{
    handle: Handle;
    startX: number;
    startY: number;
    origin: ScanRegion;
  } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

  const updateFromPointer = (event: ReactPointerEvent, handle: Handle, origin: ScanRegion) => {
    const image = imageRef.current;
    if (!image || image.naturalWidth === 0) return;
    const point = clientToImage(event, image);
    if (handle === "draw") {
      onChange(
        regionFromDrag(
          dragRef.current!.startX,
          dragRef.current!.startY,
          point.x,
          point.y,
          image.naturalWidth,
          image.naturalHeight,
        ),
      );
      return;
    }
    if (handle === "move") {
      const dx = (point.x - dragRef.current!.startX) / image.naturalWidth;
      const dy = (point.y - dragRef.current!.startY) / image.naturalHeight;
      onChange(clampScanRegion({ ...origin, x: origin.x + dx, y: origin.y + dy }));
      return;
    }
    const start = {
      x: handle.includes("w") ? origin.x + origin.width : origin.x,
      y: handle.includes("n") ? origin.y + origin.height : origin.y,
    };
    onChange(
      regionFromDrag(
        start.x * image.naturalWidth,
        start.y * image.naturalHeight,
        point.x,
        point.y,
        image.naturalWidth,
        image.naturalHeight,
      ),
    );
  };

  const onImagePointerDown = (event: ReactPointerEvent<HTMLImageElement>) => {
    const image = imageRef.current;
    if (!image) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = clientToImage(event, image);
    dragRef.current = {
      handle: "draw",
      startX: point.x,
      startY: point.y,
      origin: region,
    };
    setDrawing(true);
    onChange(
      regionFromDrag(point.x, point.y, point.x, point.y, image.naturalWidth, image.naturalHeight),
    );
  };

  const onHandlePointerDown = (handle: Handle) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    const image = imageRef.current;
    if (!image) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = clientToImage(event, image);
    dragRef.current = { handle, startX: point.x, startY: point.y, origin: region };
    setDrawing(true);
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    if (!drawing || !dragRef.current) return;
    updateFromPointer(event, dragRef.current.handle, dragRef.current.origin);
  };

  const endDrag = () => {
    dragRef.current = null;
    setDrawing(false);
  };

  const inches = describeScanInches(region, imageSize.width, imageSize.height, previewDpi);
  const official = officialPixelSize(
    region,
    imageSize.width,
    imageSize.height,
    previewDpi,
    officialDpi,
  );

  return (
    <div className="space-y-2" data-testid="scan-preview">
      <div className="relative mx-auto max-h-80 w-fit max-w-full overflow-hidden rounded border border-zinc-700 bg-zinc-950">
        <img
          ref={imageRef}
          src={src}
          alt="Scan preview"
          data-testid="scan-preview-image"
          className="block max-h-80 max-w-full cursor-crosshair select-none"
          draggable={false}
          onLoad={(event) => {
            const width = event.currentTarget.naturalWidth;
            const height = event.currentTarget.naturalHeight;
            setImageSize({ width, height });
            onImageSize?.(width, height);
          }}
          onPointerDown={onImagePointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
        <div
          className="pointer-events-none absolute border-2 border-blue-400 bg-blue-400/15"
          style={{
            left: `${region.x * 100}%`,
            top: `${region.y * 100}%`,
            width: `${region.width * 100}%`,
            height: `${region.height * 100}%`,
          }}
        >
          <div className="pointer-events-auto absolute inset-0 cursor-move">
            <button
              type="button"
              aria-label="Move scan area"
              data-testid="scan-crop-move"
              className="h-full w-full cursor-move bg-transparent"
              onPointerDown={onHandlePointerDown("move")}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
            />
          </div>
          {(["nw", "ne", "sw", "se"] as const).map((handle) => (
            <button
              key={handle}
              type="button"
              aria-label={`Resize ${handle}`}
              data-testid={`scan-crop-${handle}`}
              className={`pointer-events-auto absolute h-3 w-3 rounded-sm border border-white bg-blue-500 ${
                handle === "nw"
                  ? "-left-1.5 -top-1.5 cursor-nwse-resize"
                  : handle === "ne"
                    ? "-right-1.5 -top-1.5 cursor-nesw-resize"
                    : handle === "sw"
                      ? "-left-1.5 -bottom-1.5 cursor-nesw-resize"
                      : "-right-1.5 -bottom-1.5 cursor-nwse-resize"
              }`}
              onPointerDown={onHandlePointerDown(handle)}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
            />
          ))}
        </div>
      </div>
      <p className="text-center text-xs text-zinc-400" data-testid="scan-preview-size">
        {hint ??
          `Drag on the preview to select the area. Selection ${inches.widthIn.toFixed(1)} × ${inches.heightIn.toFixed(1)} in · official scan ≈ ${official.width} × ${official.height} px at ${officialDpi} DPI`}
      </p>
    </div>
  );
}
