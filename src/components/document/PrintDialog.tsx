import { useEffect, useState } from "react";
import { printDocument } from "@/services/printService";
import { useDocumentStore } from "@/stores/documentStore";
import { useUiStore } from "@/stores/uiStore";
import type { PrintPageMode } from "@shared/types";

export function PrintDialog() {
  const showPrintDialog = useUiStore((s) => s.showPrintDialog);
  const closePrintDialog = useUiStore((s) => s.closePrintDialog);
  const pageCount = useDocumentStore((s) => s.metadata?.pageCount ?? 0);
  const currentPage = useDocumentStore((s) => s.currentPage);
  const [mode, setMode] = useState<PrintPageMode>("all");
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!showPrintDialog) return;
    setMode("all");
    setFrom(1);
    setTo(pageCount || 1);
  }, [showPrintDialog, pageCount]);

  if (!showPrintDialog) return null;

  const handlePrint = () => {
    void (async () => {
      setBusy(true);
      try {
        await printDocument({ mode, from, to });
        closePrintDialog();
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => {
        if (!busy) closePrintDialog();
      }}
    >
      <div
        role="dialog"
        data-testid="print-dialog"
        aria-labelledby="print-dialog-title"
        className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="print-dialog-title" className="text-base font-semibold text-zinc-100">
          Print
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Sends the current PDF pages to the system print dialog. Flatten markup first if you need
          annotations included.
        </p>

        <fieldset className="mt-4 space-y-2 text-sm text-zinc-200">
          <legend className="sr-only">Pages to print</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="print-range"
              checked={mode === "all"}
              onChange={() => setMode("all")}
            />
            All pages ({pageCount})
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="print-range"
              checked={mode === "current"}
              onChange={() => setMode("current")}
            />
            Current page ({currentPage})
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="print-range"
              data-testid="print-range"
              checked={mode === "range"}
              onChange={() => setMode("range")}
            />
            Pages
            <input
              type="number"
              min={1}
              max={pageCount}
              disabled={mode !== "range"}
              value={from}
              onChange={(e) => setFrom(Number(e.target.value))}
              className="w-16 rounded border border-zinc-600 bg-zinc-800 px-1 py-0.5 disabled:opacity-40"
            />
            –
            <input
              type="number"
              min={1}
              max={pageCount}
              disabled={mode !== "range"}
              value={to}
              onChange={(e) => setTo(Number(e.target.value))}
              className="w-16 rounded border border-zinc-600 bg-zinc-800 px-1 py-0.5 disabled:opacity-40"
            />
          </label>
        </fieldset>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={closePrintDialog}
            className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="print-confirm"
            disabled={busy || pageCount < 1}
            onClick={handlePrint}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500 disabled:opacity-40"
          >
            Print…
          </button>
        </div>
      </div>
    </div>
  );
}
