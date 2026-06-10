import { useUiStore } from "@/stores/uiStore";
import { SplitPdfControls } from "./SplitPdfControls";

export function SplitPdfDialog() {
  const showSplitDialog = useUiStore((s) => s.showSplitDialog);
  const closeSplitDialog = useUiStore((s) => s.closeSplitDialog);

  if (!showSplitDialog) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={closeSplitDialog}
    >
      <div
        role="dialog"
        data-testid="split-dialog"
        aria-labelledby="split-dialog-title"
        className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="split-dialog-title" className="text-base font-semibold text-zinc-100">
          Split PDF
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Choose how to divide the document. Output files are saved to disk.
        </p>
        <div className="mt-4">
          <SplitPdfControls onComplete={closeSplitDialog} />
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={closeSplitDialog}
            className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
