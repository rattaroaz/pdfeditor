import { logUserAction } from "@/lib/logging";
import { useUiStore } from "@/stores/uiStore";
import { useAnnotationStore } from "@/stores/annotationStore";
import { useDocumentStore } from "@/stores/documentStore";
import type { AppMode, Tool } from "@shared/types";

const MODES: { id: AppMode; label: string }[] = [
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

export function ModeToolbar() {
  const appMode = useUiStore((s) => s.appMode);
  const setAppMode = useUiStore((s) => s.setAppMode);
  const activeTool = useAnnotationStore((s) => s.activeTool);
  const setActiveTool = useAnnotationStore((s) => s.setActiveTool);

  const tools = appMode === "edit" ? EDIT_TOOLS : appMode === "forms" ? FORM_TOOLS : [];

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-zinc-700 bg-zinc-950 px-2 py-1">
      {MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          onClick={() => {
            setAppMode(mode.id);
            logUserAction("set_app_mode", `Mode changed to ${mode.id}`, "info", {
              metadata: { mode: mode.id },
            });
            if (mode.id === "edit") setActiveTool("add-text-block");
            if (mode.id === "forms") {
              setActiveTool("select");
              useDocumentStore.getState().setSidebarTab("forms");
            }
            if (mode.id === "markup") setActiveTool("select");
          }}
          className={`rounded px-2 py-1 text-xs ${
            appMode === mode.id ? "bg-blue-600 text-white" : "text-zinc-400 hover:bg-zinc-800"
          }`}
        >
          {mode.label}
        </button>
      ))}
      {tools.length > 0 && <span className="mx-1 h-4 w-px bg-zinc-700" />}
      {tools.map((tool) => (
        <button
          key={tool.id}
          type="button"
          title={tool.label}
          onClick={() => setActiveTool(tool.id)}
          className={`flex h-8 min-w-8 items-center justify-center rounded px-2 text-sm ${
            activeTool === tool.id ? "bg-emerald-600 text-white" : "text-zinc-300 hover:bg-zinc-800"
          }`}
        >
          {tool.icon}
        </button>
      ))}
    </div>
  );
}
