import { useUiStore } from "@/stores/uiStore";

export function UpdateDialog() {
  const showUpdateDialog = useUiStore((s) => s.showUpdateDialog);
  const phase = useUiStore((s) => s.updatePhase);
  const message = useUiStore((s) => s.updateMessage);
  const closeUpdateDialog = useUiStore((s) => s.closeUpdateDialog);

  if (!showUpdateDialog) return null;

  const busy = phase === "checking" || phase === "downloading" || phase === "installing";
  const title =
    phase === "checking"
      ? "Checking for updates"
      : phase === "downloading"
        ? "Downloading update"
        : phase === "installing"
          ? "Installing update"
          : phase === "up_to_date"
            ? "Up to date"
            : phase === "error"
              ? "Update failed"
              : "Updates";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={busy ? undefined : closeUpdateDialog}
    >
      <div
        role="dialog"
        aria-labelledby="update-dialog-title"
        className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="update-dialog-title" className="text-base font-semibold text-zinc-100">
          {title}
        </h2>
        <p className="mt-3 text-sm text-zinc-300">{message}</p>
        {busy && (
          <p className="mt-2 text-xs text-zinc-500">
            {phase === "checking"
              ? "Comparing the published app version with your installed version."
              : "Downloading and applying the newer version in the background. The app will restart when finished."}
          </p>
        )}
        {!busy && (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={closeUpdateDialog}
              className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
