import { forwardRef, useEffect, useRef, useState } from "react";
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
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [pageDragFrom, setPageDragFrom] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const lastClicked = useRef<number | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

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

  const finishPageDrag = (toIndex: number) => {
    const fromIndex = pageDragFrom;
    setPageDragFrom(null);
    setDragIndex(null);
    setDropIndex(null);
    if (fromIndex === null || fromIndex === toIndex) return;
    const newOrder = reorderPageNumbers(pageCount, fromIndex, toIndex);
    void runAction(() => reorderPages(newOrder));
  };

  useEffect(() => {
    if (pageDragFrom === null) return;

    const findDropIndex = (clientY: number) => {
      let hoverIndex = pageDragFrom!;
      for (let i = 0; i < itemRefs.current.length; i++) {
        const el = itemRefs.current[i];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (clientY < midY) {
          hoverIndex = i;
          break;
        }
        hoverIndex = i;
      }
      return hoverIndex;
    };

    const onPointerMove = (e: PointerEvent) => {
      setDropIndex(findDropIndex(e.clientY));
    };

    const onPointerUp = (e: PointerEvent) => {
      finishPageDrag(findDropIndex(e.clientY));
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [pageDragFrom, pageCount]);

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
        Drag the grip to reorder · Ctrl+click to multi-select
      </p>
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {pageNumbers.map((pageNumber, index) => (
          <ThumbnailItem
            key={`${pageNumber}-${pageCount}`}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            pageNumber={pageNumber}
            isActive={currentPage === pageNumber}
            isSelected={selected.has(pageNumber)}
            isDragging={dragIndex === index}
            isDropTarget={dropIndex === index && pageDragFrom !== null && pageDragFrom !== index}
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
            onGripPointerDown={(e) => {
              if (busy) return;
              e.preventDefault();
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              setPageDragFrom(index);
              setDragIndex(index);
              setDropIndex(index);
            }}
          />
        ))}
      </div>
    </div>
  );
}

const ThumbnailItem = forwardRef(function ThumbnailItem(
  {
    pageNumber,
    isActive,
    isSelected,
    isDragging,
    isDropTarget,
    disabled,
    onSelect,
    onGripPointerDown,
  }: {
    pageNumber: number;
    isActive: boolean;
    isSelected: boolean;
    isDragging: boolean;
    isDropTarget: boolean;
    disabled: boolean;
    onSelect: (e: React.MouseEvent) => void;
    onGripPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  },
  ref: React.Ref<HTMLDivElement>,
) {
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
    <div
      ref={ref}
      className={`flex gap-1 rounded border p-1 transition ${
        isSelected
          ? "border-blue-400 bg-blue-950/30 ring-1 ring-blue-400"
          : isActive
            ? "border-blue-500 ring-1 ring-blue-500"
            : "border-zinc-700 hover:border-zinc-500"
      } ${isDragging ? "opacity-50" : ""} ${
        isDropTarget ? "border-emerald-400 ring-2 ring-emerald-400/70" : ""
      }`}
    >
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={`Drag page ${pageNumber} to reorder`}
        title="Drag to reorder"
        className={`flex shrink-0 touch-none select-none items-center self-stretch px-0.5 text-zinc-500 ${
          disabled ? "cursor-not-allowed opacity-40" : "cursor-grab hover:text-zinc-300 active:cursor-grabbing"
        }`}
        onPointerDown={onGripPointerDown}
      >
        ⋮⋮
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        className="min-w-0 flex-1 text-left"
      >
        <canvas ref={canvasRef} className="mx-auto block max-w-full bg-white" />
        <span className="mt-1 block text-center text-xs text-zinc-400">{pageNumber}</span>
      </button>
    </div>
  );
});

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
