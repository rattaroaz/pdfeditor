import { useMemo, useState } from "react";
import { navigateToAnnotation } from "@/lib/navigateToTarget";
import { useAnnotationStore } from "@/stores/annotationStore";
import { useDocumentStore } from "@/stores/documentStore";
import type { Annotation, AnnotationType } from "@shared/types";

const TYPE_LABELS: Record<AnnotationType, string> = {
  highlight: "Highlight",
  underline: "Underline",
  strikeout: "Strikeout",
  note: "Note",
  freehand: "Draw",
  text: "Text box",
  stamp: "Stamp",
  shape: "Shape",
};

function annotationLabel(ann: Annotation): string {
  switch (ann.type) {
    case "note":
    case "text":
      return ann.content.slice(0, 60);
    case "stamp":
      return ann.stamp;
    case "shape":
      return ann.shape;
    default:
      return TYPE_LABELS[ann.type];
  }
}

export function AnnotationsPanel() {
  const annotations = useAnnotationStore((s) => s.annotations);
  const selectAnnotation = useAnnotationStore((s) => s.selectAnnotation);
  const selectedId = useAnnotationStore((s) => s.selectedId);
  const setCurrentPage = useDocumentStore((s) => s.setCurrentPage);
  const [filterType, setFilterType] = useState<AnnotationType | "all">("all");

  const filtered = useMemo(() => {
    const sorted = [...annotations].sort(
      (a, b) => a.pageIndex - b.pageIndex || a.createdAt.localeCompare(b.createdAt),
    );
    if (filterType === "all") return sorted;
    return sorted.filter((a) => a.type === filterType);
  }, [annotations, filterType]);

  if (annotations.length === 0) {
    return <p className="p-3 text-xs text-zinc-500">No annotations in this document.</p>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-zinc-700 p-2">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as AnnotationType | "all")}
          className="w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs"
        >
          <option value="all">All types</option>
          {(Object.keys(TYPE_LABELS) as AnnotationType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      <p className="px-2 py-1 text-[10px] text-zinc-500">Double-click to jump to item on page</p>
      <div className="flex-1 overflow-y-auto p-2">
        {filtered.map((ann) => (
          <button
            key={ann.id}
            type="button"
            onClick={() => {
              selectAnnotation(ann.id);
              setCurrentPage(ann.pageIndex + 1, { scroll: true });
            }}
            onDoubleClick={(e) => {
              e.preventDefault();
              navigateToAnnotation(ann);
            }}
            className={`mb-1 block w-full rounded border px-2 py-1.5 text-left text-xs ${
              selectedId === ann.id
                ? "border-blue-500 bg-zinc-800"
                : "border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/50"
            }`}
          >
            <span className="font-medium text-zinc-300">{TYPE_LABELS[ann.type]}</span>
            <span className="ml-2 text-zinc-500">p.{ann.pageIndex + 1}</span>
            <span className="mt-0.5 block truncate text-zinc-400">{annotationLabel(ann)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
