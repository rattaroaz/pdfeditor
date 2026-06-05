import { useAnnotationStore } from "@/stores/annotationStore";
import type { StampKind, Tool } from "@shared/types";

const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: "select", label: "Select", icon: "↖" },
  { id: "hand", label: "Hand", icon: "✋" },
  { id: "highlight", label: "Highlight", icon: "🖍" },
  { id: "underline", label: "Underline", icon: "U" },
  { id: "strikeout", label: "Strikeout", icon: "S" },
  { id: "note", label: "Note", icon: "💬" },
  { id: "text", label: "Text box", icon: "T" },
  { id: "freehand", label: "Draw", icon: "✏" },
  { id: "rectangle", label: "Rectangle", icon: "▭" },
  { id: "ellipse", label: "Ellipse", icon: "○" },
  { id: "line", label: "Line", icon: "／" },
  { id: "arrow", label: "Arrow", icon: "→" },
  { id: "stamp", label: "Stamp", icon: "🏷" },
];

const STAMPS: { id: StampKind; label: string }[] = [
  { id: "approved", label: "Approved" },
  { id: "draft", label: "Draft" },
  { id: "confidential", label: "Confidential" },
  { id: "not-approved", label: "Not Approved" },
];

export function ToolPalette({ embedded = false }: { embedded?: boolean }) {
  const activeTool = useAnnotationStore((s) => s.activeTool);
  const setActiveTool = useAnnotationStore((s) => s.setActiveTool);
  const activeStamp = useAnnotationStore((s) => s.activeStamp);
  const setActiveStamp = useAnnotationStore((s) => s.setActiveStamp);

  return (
    <div
      className={
        embedded
          ? "flex flex-wrap items-center gap-1 px-2 py-1.5"
          : "flex flex-wrap items-center gap-1 border-b border-zinc-700 bg-zinc-900 px-2 py-1.5"
      }
    >
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          data-testid={`tool-${tool.id}`}
          title={tool.label}
          onClick={() => setActiveTool(tool.id)}
          className={`flex h-8 min-w-8 items-center justify-center rounded px-2 text-sm ${
            activeTool === tool.id
              ? "bg-blue-600 text-white"
              : "text-zinc-300 hover:bg-zinc-800"
          }`}
        >
          {tool.icon}
        </button>
      ))}
      {activeTool === "stamp" && (
        <>
          <span className="mx-1 h-4 w-px bg-zinc-700" />
          {STAMPS.map((stamp) => (
            <button
              key={stamp.id}
              type="button"
              title={stamp.label}
              onClick={() => setActiveStamp(stamp.id)}
              className={`rounded px-2 py-1 text-xs ${
                activeStamp === stamp.id
                  ? "bg-amber-600 text-white"
                  : "text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              {stamp.label}
            </button>
          ))}
        </>
      )}
    </div>
  );
}
