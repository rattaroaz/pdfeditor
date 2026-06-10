import { useEffect } from "react";
import { searchDocument } from "@/lib/pdf/pdfEngine";
import { searchAnnotations } from "@/lib/searchAnnotations";
import { useDocumentStore } from "@/stores/documentStore";
import { useUiStore } from "@/stores/uiStore";
import { useAnnotationStore } from "@/stores/annotationStore";

export function SearchBar() {
  const showSearch = useUiStore((s) => s.showSearch);
  const searchQuery = useUiStore((s) => s.searchQuery);
  const setSearchQuery = useUiStore((s) => s.setSearchQuery);
  const searchMatches = useUiStore((s) => s.searchMatches);
  const activeMatchIndex = useUiStore((s) => s.activeMatchIndex);
  const setSearchMatches = useUiStore((s) => s.setSearchMatches);
  const setActiveMatchIndex = useUiStore((s) => s.setActiveMatchIndex);
  const caseSensitive = useUiStore((s) => s.caseSensitive);
  const setCaseSensitive = useUiStore((s) => s.setCaseSensitive);
  const wholeWord = useUiStore((s) => s.wholeWord);
  const setWholeWord = useUiStore((s) => s.setWholeWord);
  const searchAnnotationsEnabled = useUiStore((s) => s.searchAnnotations);
  const setSearchAnnotations = useUiStore((s) => s.setSearchAnnotations);
  const pdfDoc = useDocumentStore((s) => s.pdfDoc);
  const setCurrentPage = useDocumentStore((s) => s.setCurrentPage);
  const annotations = useAnnotationStore((s) => s.annotations);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchMatches([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const docMatches = pdfDoc
          ? (await searchDocument(pdfDoc, searchQuery, caseSensitive, wholeWord)).map(
              (m) => ({ ...m, source: "document" as const }),
            )
          : [];
        const annMatches = searchAnnotationsEnabled
          ? searchAnnotations(annotations, searchQuery, caseSensitive, wholeWord)
          : [];
        if (!cancelled) setSearchMatches([...docMatches, ...annMatches]);
      } catch {
        if (!cancelled) setSearchMatches([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    pdfDoc,
    annotations,
    searchQuery,
    caseSensitive,
    wholeWord,
    searchAnnotationsEnabled,
    setSearchMatches,
  ]);

  const goToMatch = (delta: number) => {
    if (searchMatches.length === 0) return;
    const next =
      (activeMatchIndex + delta + searchMatches.length) % searchMatches.length;
    setActiveMatchIndex(next);
    const match = searchMatches[next];
    setCurrentPage(match.pageIndex + 1, { scroll: true });
    if (match.source === "annotation" && match.annotationId) {
      useAnnotationStore.getState().selectAnnotation(match.annotationId);
    }
  };

  if (!showSearch) return null;

  return (
    <div
      data-testid="search-bar"
      className="flex flex-wrap items-center gap-2 border-b border-zinc-700 bg-zinc-900 px-3 py-2"
    >
      <input
        type="search"
        data-testid="search-input"
        placeholder="Find in document…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") goToMatch(e.shiftKey ? -1 : 1);
          if (e.key === "Escape") useUiStore.getState().toggleSearch();
        }}
        className="min-w-40 flex-1 rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm"
        autoFocus
      />
      <label className="flex items-center gap-1 text-xs text-zinc-400">
        <input
          type="checkbox"
          checked={caseSensitive}
          onChange={(e) => setCaseSensitive(e.target.checked)}
        />
        Match case
      </label>
      <label className="flex items-center gap-1 text-xs text-zinc-400">
        <input
          type="checkbox"
          checked={wholeWord}
          onChange={(e) => setWholeWord(e.target.checked)}
        />
        Whole words
      </label>
      <label className="flex items-center gap-1 text-xs text-zinc-400">
        <input
          type="checkbox"
          checked={searchAnnotationsEnabled}
          onChange={(e) => setSearchAnnotations(e.target.checked)}
        />
        Comments
      </label>
      <span data-testid="search-match-count" className="text-xs text-zinc-500">
        {searchMatches.length === 0
          ? searchQuery.trim()
            ? "No matches"
            : "Type to search"
          : `${activeMatchIndex + 1} / ${searchMatches.length}`}
      </span>
      <button
        type="button"
        className="rounded px-2 py-1 text-sm hover:bg-zinc-800"
        onClick={() => goToMatch(-1)}
      >
        ↑
      </button>
      <button
        type="button"
        className="rounded px-2 py-1 text-sm hover:bg-zinc-800"
        onClick={() => goToMatch(1)}
      >
        ↓
      </button>
      <button
        type="button"
        className="rounded px-2 py-1 text-sm hover:bg-zinc-800"
        onClick={() => useUiStore.getState().toggleSearch()}
      >
        ✕
      </button>
    </div>
  );
}
