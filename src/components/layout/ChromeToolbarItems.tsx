import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from "@/lib/constants";
import { logUserAction } from "@/lib/logging";
import { undoEdit, redoEdit } from "@/services/historyService";
import { useAnnotationStore } from "@/stores/annotationStore";
import { useDocumentStore } from "@/stores/documentStore";
import { useHistoryStore } from "@/stores/historyStore";
import { useUiStore } from "@/stores/uiStore";
import { DraggableToolbarItem } from "@/components/layout/ToolbarDragContext";
import type { ToolbarItemId } from "@/lib/toolbarOrder";
import type { AppMode, Tool } from "@shared/types";

const MODES: { id: AppMode; label: string }[] = [
  { id: "document", label: "Standard" },
  { id: "markup", label: "Markup" },
  { id: "edit", label: "Edit" },
  { id: "forms", label: "Forms" },
];

function selectAppMode(mode: AppMode) {
  const setAppMode = useUiStore.getState().setAppMode;
  const setActiveTool = useAnnotationStore.getState().setActiveTool;

  setAppMode(mode);
  logUserAction("set_app_mode", `Mode changed to ${mode}`, "info", {
    metadata: { mode },
  });

  if (mode === "edit") setActiveTool("edit-text");
  if (mode === "forms") {
    setActiveTool("select");
    useDocumentStore.getState().setSidebarTab("forms");
  }
  if (mode === "markup") setActiveTool("select");
}

export function ToolbarItem({ itemId }: { itemId: ToolbarItemId }) {
  switch (itemId) {
    case "toolbar-modes":
      return <ToolbarModes />;
    case "toolbar-undo-redo":
      return <ToolbarUndoRedo />;
    case "toolbar-page-nav":
      return <ToolbarPageNav />;
    case "toolbar-sidebar":
      return <ToolbarSidebar />;
    case "toolbar-rotate":
      return <ToolbarRotate />;
    case "toolbar-zoom":
      return <ToolbarZoom />;
    default:
      return null;
  }
}

function DragHandle() {
  return (
    <span
      className="cursor-grab select-none px-0.5 text-[10px] leading-none text-zinc-600 active:cursor-grabbing"
      aria-hidden
    >
      ⠿
    </span>
  );
}

function ToolbarModes() {
  const appMode = useUiStore((s) => s.appMode);

  return (
    <DraggableToolbarItem id="toolbar-modes" className="flex items-center gap-1">
      <DragHandle />
      {MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          data-testid={`toolbar-mode-${mode.id}`}
          onClick={() => selectAppMode(mode.id)}
          className={`rounded px-2 py-1 ${
            appMode === mode.id
              ? "bg-blue-600 text-white"
              : "text-zinc-400 hover:bg-zinc-800"
          }`}
        >
          {mode.label}
        </button>
      ))}
    </DraggableToolbarItem>
  );
}

function ToolbarUndoRedo() {
  const hasDocument = useDocumentStore((s) => !!s.pdfDoc);
  const canUndo = useHistoryStore((s) => s.past.length > 0);
  const canRedo = useHistoryStore((s) => s.future.length > 0);

  return (
    <DraggableToolbarItem id="toolbar-undo-redo" className="flex items-center gap-2">
      <DragHandle />
      <button
        type="button"
        title="Undo (Ctrl+Z)"
        className="rounded px-2 py-1 hover:bg-zinc-800 disabled:opacity-40"
        disabled={!hasDocument || !canUndo}
        onClick={() => undoEdit()}
      >
        Undo
      </button>
      <button
        type="button"
        title="Redo (Ctrl+Y)"
        className="rounded px-2 py-1 hover:bg-zinc-800 disabled:opacity-40"
        disabled={!hasDocument || !canRedo}
        onClick={() => redoEdit()}
      >
        Redo
      </button>
    </DraggableToolbarItem>
  );
}

function ToolbarPageNav() {
  const currentPage = useDocumentStore((s) => s.currentPage);
  const setCurrentPage = useDocumentStore((s) => s.setCurrentPage);
  const metadata = useDocumentStore((s) => s.metadata);
  const hasDocument = useDocumentStore((s) => !!s.pdfDoc);
  const pageCount = metadata?.pageCount ?? 1;

  return (
    <DraggableToolbarItem id="toolbar-page-nav" className="flex items-center gap-2">
      <DragHandle />
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
        onChange={(e) => setCurrentPage(Number(e.target.value) || 1, { scroll: true })}
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
    </DraggableToolbarItem>
  );
}

function ToolbarSidebar() {
  const showSidebar = useDocumentStore((s) => s.showSidebar);
  const setShowSidebar = useDocumentStore((s) => s.setShowSidebar);

  return (
    <DraggableToolbarItem id="toolbar-sidebar" className="flex items-center">
      <DragHandle />
      <button
        type="button"
        data-testid="toolbar-toggle-sidebar"
        title={showSidebar ? "Hide sidebar" : "Show sidebar"}
        className={`rounded px-2 py-1 hover:bg-zinc-800 ${
          showSidebar ? "text-zinc-100" : "text-zinc-500"
        }`}
        onClick={() => setShowSidebar(!showSidebar)}
      >
        Sidebar
      </button>
    </DraggableToolbarItem>
  );
}

function ToolbarRotate() {
  const hasDocument = useDocumentStore((s) => !!s.pdfDoc);
  const rotateClockwise = useDocumentStore((s) => s.rotateClockwise);
  const rotateCounterClockwise = useDocumentStore((s) => s.rotateCounterClockwise);

  return (
    <DraggableToolbarItem id="toolbar-rotate" className="flex items-center gap-1">
      <DragHandle />
      <button
        type="button"
        data-testid="toolbar-rotate-ccw"
        title="Rotate counter-clockwise"
        className="rounded px-2 py-1 hover:bg-zinc-800 disabled:opacity-40"
        disabled={!hasDocument}
        onClick={() => rotateCounterClockwise()}
      >
        ↺
      </button>
      <button
        type="button"
        data-testid="toolbar-rotate-cw"
        title="Rotate clockwise"
        className="rounded px-2 py-1 hover:bg-zinc-800 disabled:opacity-40"
        disabled={!hasDocument}
        onClick={() => rotateClockwise()}
      >
        ↻
      </button>
    </DraggableToolbarItem>
  );
}

function ToolbarZoom() {
  const zoom = useDocumentStore((s) => s.zoom);
  const setZoom = useDocumentStore((s) => s.setZoom);
  const setZoomMode = useDocumentStore((s) => s.setZoomMode);
  const hasDocument = useDocumentStore((s) => !!s.pdfDoc);

  return (
    <DraggableToolbarItem id="toolbar-zoom" className="flex items-center gap-2">
      <DragHandle />
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
    </DraggableToolbarItem>
  );
}

export const EDIT_TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: "edit-text", label: "Edit text", icon: "✎" },
  { id: "add-text-block", label: "Add text", icon: "T+" },
  { id: "add-image", label: "Add image", icon: "🖼" },
];

export const FORM_TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: "select", label: "Fill", icon: "✓" },
  { id: "form-text", label: "Text field", icon: "Tx" },
  { id: "form-checkbox", label: "Checkbox", icon: "☑" },
  { id: "form-dropdown", label: "Dropdown", icon: "▾" },
];
