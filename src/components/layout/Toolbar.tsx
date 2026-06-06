import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from "@/lib/constants";
import { logUserAction } from "@/lib/logging";
import { undoEdit, redoEdit } from "@/services/historyService";
import { useDocumentStore } from "@/stores/documentStore";
import { useHistoryStore } from "@/stores/historyStore";
import { useUiStore } from "@/stores/uiStore";
import { useAnnotationStore } from "@/stores/annotationStore";
import { ToolPalette } from "@/components/annotations/ToolPalette";
import type { AppMode, Tool } from "@shared/types";

const MODES: { id: AppMode; label: string }[] = [
  { id: "document", label: "Standard" },
  { id: "markup", label: "Markup" },
  { id: "edit", label: "Edit" },
  { id: "forms", label: "Forms" },
];

const EDIT_TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: "edit-text", label: "Edit text", icon: "✎" },
  { id: "add-text-block", label: "Add text", icon: "T+" },
  { id: "add-image", label: "Add image", icon: "🖼" },
];

const FORM_TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: "select", label: "Fill", icon: "✓" },
  { id: "form-text", label: "Text field", icon: "Tx" },
  { id: "form-checkbox", label: "Checkbox", icon: "☑" },
  { id: "form-dropdown", label: "Dropdown", icon: "▾" },
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

function ModeToolButtons({
  tools,
  activeTool,
  onSelect,
}: {
  tools: { id: Tool; label: string; icon: string }[];
  activeTool: Tool;
  onSelect: (tool: Tool) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 px-2 py-1.5">
      {tools.map((tool) => (
        <button
          key={tool.id}
          type="button"
          title={tool.label}
          data-testid={`tool-${tool.id}`}
          onClick={() => onSelect(tool.id)}
          className={`flex h-8 min-w-8 items-center justify-center rounded px-2 text-sm ${
            activeTool === tool.id
              ? "bg-emerald-600 text-white"
              : "text-zinc-300 hover:bg-zinc-800"
          }`}
        >
          {tool.icon}
        </button>
      ))}
    </div>
  );
}

export function Toolbar() {
  const zoom = useDocumentStore((s) => s.zoom);
  const setZoom = useDocumentStore((s) => s.setZoom);
  const setZoomMode = useDocumentStore((s) => s.setZoomMode);
  const currentPage = useDocumentStore((s) => s.currentPage);
  const setCurrentPage = useDocumentStore((s) => s.setCurrentPage);
  const metadata = useDocumentStore((s) => s.metadata);
  const hasDocument = useDocumentStore((s) => !!s.pdfDoc);
  const showSidebar = useDocumentStore((s) => s.showSidebar);
  const setShowSidebar = useDocumentStore((s) => s.setShowSidebar);
  const canUndo = useHistoryStore((s) => s.past.length > 0);
  const canRedo = useHistoryStore((s) => s.future.length > 0);
  const appMode = useUiStore((s) => s.appMode);
  const activeTool = useAnnotationStore((s) => s.activeTool);
  const setActiveTool = useAnnotationStore((s) => s.setActiveTool);

  const pageCount = metadata?.pageCount ?? 1;
  const showModeTools = appMode === "markup" || appMode === "edit" || appMode === "forms";

  return (
    <div className="border-b border-zinc-700 bg-zinc-900">
      <div className="flex items-center gap-2 px-3 py-1.5 text-sm">
        <div className="flex items-center gap-1">
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
        </div>

        <span className="mx-1 h-4 w-px bg-zinc-700" />

        <div className="ml-auto flex items-center gap-2">
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

          <span className="mx-1 h-4 w-px bg-zinc-700" />

          <button
            type="button"
            data-testid="toolbar-toggle-sidebar"
            title={showSidebar ? "Hide sidebar" : "Show sidebar"}
            className={`rounded px-2 py-1 hover:bg-zinc-800 ${showSidebar ? "text-zinc-100" : "text-zinc-500"}`}
            onClick={() => setShowSidebar(!showSidebar)}
          >
            Sidebar
          </button>

          <span className="mx-1 h-4 w-px bg-zinc-700" />

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
        </div>
      </div>

      {showModeTools && (
        <div
          className="border-t border-zinc-700 bg-zinc-950"
          data-testid="toolbar-mode-tools"
        >
          {appMode === "markup" && <ToolPalette embedded />}
          {appMode === "edit" && (
            <ModeToolButtons
              tools={EDIT_TOOLS}
              activeTool={activeTool}
              onSelect={setActiveTool}
            />
          )}
          {appMode === "forms" && (
            <ModeToolButtons
              tools={FORM_TOOLS}
              activeTool={activeTool}
              onSelect={setActiveTool}
            />
          )}
        </div>
      )}
    </div>
  );
}
