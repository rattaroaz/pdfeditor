import { useEffect } from "react";
import { useDocumentStore } from "@/stores/documentStore";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StatusBar() {
  const fileName = useDocumentStore((s) => s.fileName);
  const isDirty = useDocumentStore((s) => s.isDirty);
  const isLoading = useDocumentStore((s) => s.isLoading);
  const metadata = useDocumentStore((s) => s.metadata);
  const isPasswordProtected = useDocumentStore((s) => s.isPasswordProtected);
  const pendingSavePassword = useDocumentStore((s) => s.pendingSavePassword);
  const removePasswordOnSave = useDocumentStore((s) => s.removePasswordOnSave);
  const currentPage = useDocumentStore((s) => s.currentPage);
  const zoom = useDocumentStore((s) => s.zoom);
  const loadError = useDocumentStore((s) => s.loadError);
  const statusMessage = useDocumentStore((s) => s.statusMessage);
  const setStatusMessage = useDocumentStore((s) => s.setStatusMessage);

  useEffect(() => {
    if (!statusMessage || statusMessage === "Saving…") return;
    const timer = setTimeout(() => setStatusMessage(null), statusMessage.length > 60 ? 8000 : 4000);
    return () => clearTimeout(timer);
  }, [statusMessage, setStatusMessage]);

  return (
    <footer
      data-testid="status-bar"
      className="flex items-center justify-between border-t border-zinc-700 bg-zinc-950 px-3 py-1 text-xs text-zinc-400"
    >
      <span className="flex items-center gap-2">
        {fileName}
        {isDirty ? " *" : ""}
        {isPasswordProtected && (
          <span
            className="inline-flex items-center gap-1 rounded bg-amber-900/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-200"
            title="This document requires a password to open"
          >
            🔒 Password protected
          </span>
        )}
        {pendingSavePassword && (
          <span className="text-[10px] text-emerald-300">Will protect on save</span>
        )}
        {removePasswordOnSave && (
          <span className="text-[10px] text-sky-300">Will remove password on save</span>
        )}
      </span>
      <span className="flex gap-4">
        {loadError && <span className="text-red-400">{loadError}</span>}
        {statusMessage && (
          <span className={statusMessage === "Saved" ? "text-green-400" : ""}>
            {statusMessage}
          </span>
        )}
        {isLoading && <span>Loading…</span>}
        {metadata && (
          <>
            <span>
              Page {currentPage} of {metadata.pageCount}
            </span>
            <span>{Math.round(zoom * 100)}%</span>
            <span>{formatBytes(metadata.fileSize)}</span>
          </>
        )}
      </span>
    </footer>
  );
}
