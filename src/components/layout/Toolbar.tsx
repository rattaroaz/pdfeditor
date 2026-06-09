import { ToolPalette } from "@/components/annotations/ToolPalette";
import {
  ToolbarItem,
  EDIT_TOOLS,
  FORM_TOOLS,
} from "@/components/layout/ChromeToolbarItems";
import { ToolbarDragProvider } from "@/components/layout/ToolbarDragContext";
import { useAnnotationStore } from "@/stores/annotationStore";
import { useUiStore } from "@/stores/uiStore";
import type { Tool } from "@shared/types";

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

function ToolbarRow() {
  const toolbarOrder = useUiStore((s) => s.toolbarOrder);

  return (
    <div
      data-toolbar-zone="toolbar"
      className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-sm"
    >
      {toolbarOrder.map((itemId) => (
        <ToolbarItem key={itemId} itemId={itemId} />
      ))}
    </div>
  );
}

export function Toolbar() {
  const appMode = useUiStore((s) => s.appMode);
  const activeTool = useAnnotationStore((s) => s.activeTool);
  const setActiveTool = useAnnotationStore((s) => s.setActiveTool);

  const showModeTools = appMode === "markup" || appMode === "edit" || appMode === "forms";

  return (
    <div className="border-b border-zinc-700 bg-zinc-900">
      <ToolbarDragProvider>
        <ToolbarRow />
      </ToolbarDragProvider>

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
