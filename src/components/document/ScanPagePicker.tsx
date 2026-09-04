import type { QueuedScanPage } from "@/lib/scanQueue";

function pageSrc(page: QueuedScanPage): string {
  return `data:${page.image.mimeType};base64,${page.image.dataBase64}`;
}

export function ScanPagePicker({
  pages,
  activeId,
  onActive,
  onToggle,
  onRemove,
  onSelectAll,
}: {
  pages: QueuedScanPage[];
  activeId: string | null;
  onActive: (id: string) => void;
  onToggle: (id: string, selected: boolean) => void;
  onRemove: (id: string) => void;
  onSelectAll: (selected: boolean) => void;
}) {
  const active = pages.find((page) => page.id === activeId) ?? pages[0] ?? null;
  const selectedCount = pages.filter((page) => page.selected).length;

  if (pages.length === 0) return null;

  return (
    <section className="mt-4 space-y-3" data-testid="scan-page-picker">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-zinc-100">Pages to import</h3>
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="scan-select-all"
            onClick={() => onSelectAll(true)}
            className="rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Select all
          </button>
          <button
            type="button"
            data-testid="scan-select-none"
            onClick={() => onSelectAll(false)}
            className="rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Select none
          </button>
        </div>
      </div>
      <p className="text-xs text-zinc-500">
        Click a page to review it. Check the pages you want in the PDF, then import.
      </p>

      {active && (
        <div className="overflow-hidden rounded border border-zinc-700 bg-zinc-950">
          <img
            src={pageSrc(active)}
            alt="Selected scan"
            data-testid="scan-page-active"
            className="mx-auto max-h-64 w-auto bg-white object-contain"
          />
        </div>
      )}

      <ul className="flex max-h-44 gap-2 overflow-x-auto pb-1">
        {pages.map((page, index) => {
          const isActive = active?.id === page.id;
          return (
            <li key={page.id} className="shrink-0">
              <div
                className={`relative w-28 rounded border p-1 ${
                  isActive ? "border-blue-400 bg-zinc-800" : "border-zinc-700 bg-zinc-900"
                } ${page.selected ? "ring-2 ring-emerald-500/70" : "opacity-70"}`}
              >
                <button
                  type="button"
                  data-testid={`scan-page-thumb-${index}`}
                  aria-pressed={isActive}
                  onClick={() => {
                    onActive(page.id);
                    if (!page.selected) onToggle(page.id, true);
                  }}
                  className="block w-full"
                >
                  <img
                    src={pageSrc(page)}
                    alt={`Scanned page ${index + 1}`}
                    className="h-28 w-full rounded bg-white object-contain"
                  />
                </button>
                <label className="mt-1 flex items-center gap-1 text-[11px] text-zinc-200">
                  <input
                    type="checkbox"
                    data-testid={`scan-page-select-${index}`}
                    checked={page.selected}
                    onChange={(event) => onToggle(page.id, event.target.checked)}
                  />
                  Page {index + 1}
                  {page.image.pageWidthIn && page.image.pageHeightIn
                    ? ` · ${page.image.pageWidthIn.toFixed(1)}×${page.image.pageHeightIn.toFixed(1)} in`
                    : ""}
                </label>
                <button
                  type="button"
                  data-testid={`scan-page-remove-${index}`}
                  aria-label={`Remove page ${index + 1}`}
                  onClick={() => onRemove(page.id)}
                  className="absolute right-1 top-1 rounded bg-black/70 px-1 text-[10px] text-zinc-200 hover:bg-black"
                >
                  ✕
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-zinc-400" data-testid="scan-page-count">
        {selectedCount} of {pages.length} selected for the PDF
      </p>
    </section>
  );
}
