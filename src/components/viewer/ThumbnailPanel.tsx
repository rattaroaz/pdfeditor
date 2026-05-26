import { useEffect, useRef, useState } from "react";
import { renderPageToCanvas } from "@/lib/pdf/pdfEngine";
import { reorderPageNumbers } from "@/lib/pageAnnotationRemap";
import { useDocumentStore } from "@/stores/documentStore";
import { deletePages, insertBlankPages, reorderPages, rotatePagesPermanent } from "@/services/pageService";
import { extractPagesToFile, exportPageAsPng } from "@/services/assemblyService";

export function ThumbnailPanelContent() {
  const metadata = useDocumentStore((s) => s.metadata);
  const currentPage = useDocumentStore((s) => s.currentPage);
  const setCurrentPage = useDocumentStore((s) => s.setCurrentPage);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const lastClicked = useRef<number | null>(null);

  const pageCount = metadata?.pageCount ?? 0;
  const pageNumbers = Array.from({ length: pageCount }, (_, i) => i + 1);

  const toggleSelect = (pageNumber: number, extend: boolean, range: boolean) => {
    setSelected((prev) => {
      const next = extend ? new Set(prev) : new Set<number>();
      if (range && lastClicked.current !== null) {
        const start = Math.min(lastClicked.current, pageNumber);
        const end = Math.max(lastClicked.current, pageNumber);
        for (let p = start; p <= end; p++) next.add(p);
      } else {
        if (next.has(pageNumber) && extend) next.delete(pageNumber);
        else next.add(pageNumber);
      }
      return next;
    });
    lastClicked.current = pageNumber;
  };

  const targetPages = selected.size > 0 ? [...selected].sort((a, b) => a - b) : [currentPage];

  const runAction = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = () => {
    if (targetPages.length >= pageCount) {
      window.alert("Cannot delete all pages — at least one page must remain.");
      return;
    }
    if (!window.confirm(`Delete ${targetPages.length} page(s)?`)) return;
    void runAction(() => deletePages(targetPages));
  };

  const handleRotate = (degrees: 90 | -90) => {
    void runAction(() => rotatePagesPermanent(targetPages, degrees));
  };

  const handleDrop = (toIndex: number) => {
    if (dragIndex === null || dragIndex === toIndex) return;
    const newOrder = reorderPageNumbers(pageCount, dragIndex, toIndex);
    void runAction(() => reorderPages(newOrder));
    setDragIndex(null);
  };

  if (!metadata) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap gap-1 border-b border-zinc-700 p-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const after = targetPages.length > 0 ? Math.max(...targetPages) : currentPage;
            void runAction(() => insertBlankPages(after, 1));
          }}
          className="rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
        >
          + Blank
        </button>
        <button
          type="button"
          disabled={busy || targetPages.length === 0}
          onClick={() => void runAction(() => extractPagesToFile(targetPages))}
          className="rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
        >
          Extract
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const page = targetPages[0] ?? currentPage;
            void exportPageAsPng(page);
          }}
          className="rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
        >
          PNG
        </button>
        <button
          type="button"
          disabled={busy || targetPages.length === 0}
          onClick={handleDelete}
          className="rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
        >
          Delete
        </button>
        <button
          type="button"
          disabled={busy || targetPages.length === 0}
          onClick={() => handleRotate(90)}
          className="rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
        >
          Rotate 90°
        </button>
        <button
          type="button"
          disabled={busy || targetPages.length === 0}
          onClick={() => handleRotate(-90)}
          className="rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
        >
          Rotate −90°
        </button>
      </div>
      <p className="px-2 py-1 text-[10px] text-zinc-500">
        Ctrl+click to multi-select · drag to reorder
      </p>
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {pageNumbers.map((pageNumber, index) => (
          <ThumbnailItem
            key={`${pageNumber}-${pageCount}`}
            pageNumber={pageNumber}
            isActive={currentPage === pageNumber}
            isSelected={selected.has(pageNumber)}
            isDragging={dragIndex === index}
            disabled={busy}
            onSelect={(e) => {
              const extend = e.ctrlKey || e.metaKey;
              const range = e.shiftKey;
              if (!extend && !range) {
                setCurrentPage(pageNumber, { scroll: true });
                setSelected(new Set([pageNumber]));
                lastClicked.current = pageNumber;
              } else {
                toggleSelect(pageNumber, extend || range, range);
              }
            }}
            onDragStart={() => setDragIndex(index)}
            onDragEnd={() => setDragIndex(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(index)}
          />
        ))}
      </div>
    </div>
  );
}

function ThumbnailItem({
  pageNumber,
  isActive,
  isSelected,
  isDragging,
  disabled,
  onSelect,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  pageNumber: number;
  isActive: boolean;
  isSelected: boolean;
  isDragging: boolean;
  disabled: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDoc = useDocumentStore((s) => s.pdfDoc);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;
        await renderPageToCanvas(page, canvasRef.current, 0.2, controller.signal);
      } catch {
        // ignore cancelled thumbnail renders
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [pdfDoc, pageNumber]);

  return (
    <button
      type="button"
      draggable={!disabled}
      onClick={onSelect}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      className={`w-full rounded border p-1 text-left transition ${
        isSelected
          ? "border-blue-400 bg-blue-950/30 ring-1 ring-blue-400"
          : isActive
            ? "border-blue-500 ring-1 ring-blue-500"
            : "border-zinc-700 hover:border-zinc-500"
      } ${isDragging ? "opacity-50" : ""}`}
    >
      <canvas ref={canvasRef} className="mx-auto block max-w-full bg-white" />
      <span className="mt-1 block text-center text-xs text-zinc-400">{pageNumber}</span>
    </button>
  );
}

/** @deprecated Use Sidebar instead */
export function ThumbnailPanel() {
  const showSidebar = useDocumentStore((s) => s.showSidebar);
  const pdfDoc = useDocumentStore((s) => s.pdfDoc);
  if (!showSidebar || !pdfDoc) return null;
  return (
    <aside className="flex w-44 shrink-0 flex-col border-r border-zinc-700 bg-zinc-900">
      <ThumbnailPanelContent />
    </aside>
  );
}
