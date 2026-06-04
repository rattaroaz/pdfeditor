import { useEffect, useMemo, useState } from "react";
import { logUserAction, reportError } from "@/lib/logging";
import {
  buildSplitRanges,
  describeSplitParts,
  splitPdfWithOptions,
  type SplitMode,
} from "@/services/assemblyService";
import { useDocumentStore } from "@/stores/documentStore";

export const SPLIT_MODES: { id: SplitMode; label: string; hint: string }[] = [
  {
    id: "half",
    label: "In half",
    hint: "Two files — first half and second half of the document.",
  },
  {
    id: "at-page",
    label: "After a page",
    hint: "Two files — everything through page N, then the rest.",
  },
  {
    id: "at-current",
    label: "After current page",
    hint: "Two files — split at the page you are viewing now.",
  },
  {
    id: "every-n",
    label: "Every N pages",
    hint: "Multiple files — each holds up to N pages in order.",
  },
  {
    id: "every-page",
    label: "One file per page",
    hint: "One PDF per page.",
  },
  {
    id: "custom",
    label: "Custom ranges",
    hint: "Define your own groups, e.g. 1-3, 4-10, 11-12.",
  },
];

export function SplitPdfControls({
  onComplete,
  showSplitButton = true,
}: {
  onComplete?: () => void;
  showSplitButton?: boolean;
}) {
  const hasDocument = useDocumentStore((s) => !!s.pdfDoc);
  const pageCount = useDocumentStore((s) => s.metadata?.pageCount ?? 0);
  const currentPage = useDocumentStore((s) => s.currentPage);
  const isLoading = useDocumentStore((s) => s.isLoading);

  const [splitMode, setSplitMode] = useState<SplitMode>("half");
  const [splitAfterPage, setSplitAfterPage] = useState(1);
  const [pagesPerFile, setPagesPerFile] = useState(5);
  const [customRanges, setCustomRanges] = useState("");

  useEffect(() => {
    const half =
      pageCount > 1
        ? `1-${Math.ceil(pageCount / 2)}, ${Math.ceil(pageCount / 2) + 1}-${pageCount}`
        : "1";
    setCustomRanges(half);
    setSplitAfterPage(Math.min(Math.max(1, currentPage), Math.max(1, pageCount - 1)));
    setPagesPerFile(Math.min(5, Math.max(1, pageCount)));
  }, [pageCount, currentPage]);

  const splitPreview = useMemo(() => {
    if (pageCount < 1) return "";
    const options = splitOptionsForMode(splitMode, {
      splitAfterPage,
      pagesPerFile,
      customRanges,
      currentPage,
      pageCount,
    });
    const ranges = buildSplitRanges(splitMode, pageCount, options);
    return describeSplitParts(ranges);
  }, [splitMode, pageCount, splitAfterPage, pagesPerFile, customRanges, currentPage]);

  const busy = isLoading;
  const selectedMode = SPLIT_MODES.find((m) => m.id === splitMode);

  const handleSplit = () => {
    const options = splitOptionsForMode(splitMode, {
      splitAfterPage,
      pagesPerFile,
      customRanges,
      currentPage,
      pageCount,
    });
    logUserAction("split_pdf", "Split PDF", "info", { metadata: { mode: splitMode } });
    void splitPdfWithOptions(splitMode, options)
      .then(() => onComplete?.())
      .catch((err) => {
        reportError(err, { category: "assembly", userAction: "split_pdf" });
      });
  };

  if (!hasDocument) {
    return <p className="text-xs text-zinc-500">Open a PDF to split it.</p>;
  }

  if (pageCount < 2) {
    return (
      <p className="text-xs text-zinc-500">This document has only one page and cannot be split.</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="split-mode" className="text-xs text-zinc-400">
          How to split ({pageCount} pages)
        </label>
        <select
          id="split-mode"
          value={splitMode}
          disabled={busy}
          onChange={(e) => setSplitMode(e.target.value as SplitMode)}
          className="w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-100"
        >
          {SPLIT_MODES.map((mode) => (
            <option key={mode.id} value={mode.id}>
              {mode.label}
            </option>
          ))}
        </select>
        {selectedMode && <p className="text-[10px] text-zinc-500">{selectedMode.hint}</p>}
      </div>

      {splitMode === "at-page" && (
        <div className="space-y-1">
          <label htmlFor="split-after" className="text-xs text-zinc-400">
            Last page in first file
          </label>
          <input
            id="split-after"
            type="number"
            min={1}
            max={pageCount - 1}
            value={splitAfterPage}
            disabled={busy}
            onChange={(e) =>
              setSplitAfterPage(Math.min(pageCount - 1, Math.max(1, Number(e.target.value) || 1)))
            }
            className="w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs text-zinc-100"
          />
        </div>
      )}

      {splitMode === "at-current" && (
        <p className="text-xs text-zinc-400">
          Current page: <span className="text-zinc-200">{currentPage}</span> — first file ends
          here; second file starts on page {Math.min(currentPage, pageCount - 1) + 1}.
        </p>
      )}

      {splitMode === "every-n" && (
        <div className="space-y-1">
          <label htmlFor="pages-per-file" className="text-xs text-zinc-400">
            Pages per file
          </label>
          <input
            id="pages-per-file"
            type="number"
            min={1}
            max={pageCount}
            value={pagesPerFile}
            disabled={busy}
            onChange={(e) =>
              setPagesPerFile(Math.min(pageCount, Math.max(1, Number(e.target.value) || 1)))
            }
            className="w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs text-zinc-100"
          />
        </div>
      )}

      {splitMode === "custom" && (
        <div className="space-y-1">
          <label htmlFor="custom-ranges" className="text-xs text-zinc-400">
            Page ranges (1–{pageCount})
          </label>
          <input
            id="custom-ranges"
            type="text"
            value={customRanges}
            disabled={busy}
            onChange={(e) => setCustomRanges(e.target.value)}
            placeholder={`e.g. 1-3, 4-${pageCount}`}
            className="w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs text-zinc-100"
          />
        </div>
      )}

      <div className="rounded border border-zinc-700/80 bg-zinc-900/60 px-2 py-1.5 text-[10px] text-zinc-400">
        <span className="font-medium text-zinc-500">Preview: </span>
        {splitPreview}
      </div>

      {showSplitButton && (
        <button
          type="button"
          disabled={busy}
          onClick={handleSplit}
          className="w-full rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Split PDF…
        </button>
      )}
    </div>
  );
}

export function splitOptionsForMode(
  splitMode: SplitMode,
  ctx: {
    splitAfterPage: number;
    pagesPerFile: number;
    customRanges: string;
    currentPage: number;
    pageCount: number;
  },
) {
  if (splitMode === "at-current") {
    return { splitAfterPage: Math.min(ctx.currentPage, Math.max(1, ctx.pageCount - 1)) };
  }
  if (splitMode === "at-page") return { splitAfterPage: ctx.splitAfterPage };
  if (splitMode === "every-n") return { pagesPerFile: ctx.pagesPerFile };
  if (splitMode === "custom") return { customRanges: ctx.customRanges };
  return {};
}
