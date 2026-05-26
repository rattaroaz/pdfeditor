import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from "@/lib/constants";
import { openPdfFromDialog, savePdf } from "@/services/documentService";
import { useDocumentStore } from "@/stores/documentStore";

export function Toolbar() {
  const zoom = useDocumentStore((s) => s.zoom);
  const setZoom = useDocumentStore((s) => s.setZoom);
  const setZoomMode = useDocumentStore((s) => s.setZoomMode);
  const currentPage = useDocumentStore((s) => s.currentPage);
  const setCurrentPage = useDocumentStore((s) => s.setCurrentPage);
  const metadata = useDocumentStore((s) => s.metadata);
  const hasDocument = useDocumentStore((s) => !!s.pdfDoc);

  const pageCount = metadata?.pageCount ?? 1;

  return (
    <div className="flex items-center gap-2 border-b border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm">
      <button
        type="button"
        className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-500"
        onClick={() => void openPdfFromDialog()}
      >
        Open
      </button>
      <button
        type="button"
        className="rounded px-2 py-1 hover:bg-zinc-800 disabled:opacity-40"
        disabled={!hasDocument}
        onClick={() => void savePdf(false)}
      >
        Save
      </button>

      <span className="mx-1 h-4 w-px bg-zinc-700" />

      <button
        type="button"
        className="rounded px-2 py-1 hover:bg-zinc-800 disabled:opacity-40"
        onClick={() => setCurrentPage(currentPage - 1, { scroll: true })}
        disabled={!hasDocument || currentPage <= 1}
      >
        ‹
      </button>
      <input
        type="number"
        min={1}
        max={pageCount}
        value={currentPage}
        disabled={!hasDocument}
        onChange={(e) =>
          setCurrentPage(Number(e.target.value) || 1, { scroll: true })
        }
        className="w-12 rounded border border-zinc-600 bg-zinc-800 px-1 py-0.5 text-center disabled:opacity-40"
      />
      <span className="text-zinc-500">/ {pageCount}</span>
      <button
        type="button"
        className="rounded px-2 py-1 hover:bg-zinc-800 disabled:opacity-40"
        onClick={() => setCurrentPage(currentPage + 1, { scroll: true })}
        disabled={!hasDocument || currentPage >= pageCount}
      >
        ›
      </button>

      <span className="mx-2 h-4 w-px bg-zinc-700" />

      <button
        type="button"
        className="rounded px-2 py-1 hover:bg-zinc-800 disabled:opacity-40"
        disabled={!hasDocument}
        onClick={() => setZoom(Math.max(ZOOM_MIN, zoom - ZOOM_STEP))}
      >
        −
      </button>
      <span className="w-12 text-center">{Math.round(zoom * 100)}%</span>
      <button
        type="button"
        className="rounded px-2 py-1 hover:bg-zinc-800 disabled:opacity-40"
        disabled={!hasDocument}
        onClick={() => setZoom(Math.min(ZOOM_MAX, zoom + ZOOM_STEP))}
      >
        +
      </button>
      <button
        type="button"
        className="rounded px-2 py-1 hover:bg-zinc-800 disabled:opacity-40"
        disabled={!hasDocument}
        onClick={() => setZoomMode("fit-width")}
      >
        Fit width
      </button>
      <button
        type="button"
        className="rounded px-2 py-1 hover:bg-zinc-800 disabled:opacity-40"
        disabled={!hasDocument}
        onClick={() => setZoomMode("fit-page")}
      >
        Fit page
      </button>
      <button
        type="button"
        className="rounded px-2 py-1 hover:bg-zinc-800 disabled:opacity-40"
        disabled={!hasDocument}
        onClick={() => useDocumentStore.getState().rotateClockwise()}
        title="Rotate clockwise"
      >
        ↻
      </button>
    </div>
  );
}
