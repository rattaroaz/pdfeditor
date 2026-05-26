import { useEffect, useState } from "react";
import { getPageSearchHighlights } from "@/lib/pdf/pdfEngine";
import { useDocumentStore } from "@/stores/documentStore";
import { useUiStore } from "@/stores/uiStore";
import type { HighlightRect } from "@shared/types";

interface SearchHighlightLayerProps {
  pageNumber: number;
  scale: number;
}

export function SearchHighlightLayer({ pageNumber, scale }: SearchHighlightLayerProps) {
  const pdfDoc = useDocumentStore((s) => s.pdfDoc);
  const rotation = useDocumentStore((s) => s.rotation);
  const searchQuery = useUiStore((s) => s.searchQuery);
  const caseSensitive = useUiStore((s) => s.caseSensitive);
  const wholeWord = useUiStore((s) => s.wholeWord);
  const showSearch = useUiStore((s) => s.showSearch);
  const searchMatches = useUiStore((s) => s.searchMatches);
  const activeMatchIndex = useUiStore((s) => s.activeMatchIndex);
  const [highlights, setHighlights] = useState<HighlightRect[]>([]);

  const pageIndex = pageNumber - 1;
  const hasDocMatches = searchMatches.some(
    (m) => m.source !== "annotation" && m.pageIndex === pageIndex,
  );

  useEffect(() => {
    if (!pdfDoc || !showSearch || !searchQuery.trim() || !hasDocMatches) {
      setHighlights([]);
      return;
    }
    let cancelled = false;

    void (async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        const rects = await getPageSearchHighlights(
          page,
          searchQuery,
          caseSensitive,
          wholeWord,
          rotation,
        );
        if (!cancelled) setHighlights(rects);
      } catch {
        if (!cancelled) setHighlights([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    pdfDoc,
    pageNumber,
    searchQuery,
    caseSensitive,
    wholeWord,
    rotation,
    showSearch,
    hasDocMatches,
  ]);

  if (!showSearch || highlights.length === 0) return null;

  const activeMatch = searchMatches[activeMatchIndex];
  const isActivePage =
    activeMatch?.source !== "annotation" && activeMatch?.pageIndex === pageIndex;

  return (
    <div className="pointer-events-none absolute inset-0">
      {highlights.map((rect, i) => (
        <div
          key={i}
          className={`absolute rounded-sm ${
            isActivePage ? "bg-orange-400/70 ring-1 ring-orange-600" : "bg-yellow-300/60"
          }`}
          style={{
            left: rect.x * scale,
            top: rect.y * scale,
            width: rect.width * scale,
            height: rect.height * scale,
          }}
        />
      ))}
    </div>
  );
}
