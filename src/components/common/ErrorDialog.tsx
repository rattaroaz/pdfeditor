import { useUiStore } from "@/stores/uiStore";

export function ErrorDialog() {
  const { showErrorDialog, lastError, dismissError } = useUiStore();

  if (!showErrorDialog || !lastError) return null;

  const copyId = async () => {
    await navigator.clipboard.writeText(lastError.errorId);
  };

  return (
    <div
      data-testid="error-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div
        role="alertdialog"
        aria-labelledby="error-title"
        className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-6 shadow-xl"
      >
        <h2 id="error-title" className="text-lg font-semibold text-red-400">
          Error
        </h2>
        <p className="mt-2 text-sm text-zinc-300">{lastError.message}</p>
        <p data-testid="error-id" className="mt-3 font-mono text-xs text-zinc-500">
          ID: {lastError.errorId}
          {lastError.code ? ` · ${lastError.code}` : ""}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={copyId}
            className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm hover:bg-zinc-800"
          >
            Copy ID
          </button>
          <button
            type="button"
            data-testid="error-dismiss"
            onClick={dismissError}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm hover:bg-blue-500"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
