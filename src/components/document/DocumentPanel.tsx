import { logUserAction, reportError } from "@/lib/logging";
import { mergeIntoCurrentDocument, mergePdfFromDialog } from "@/services/assemblyService";
import { useDocumentStore } from "@/stores/documentStore";
import { SplitPdfControls } from "./SplitPdfControls";

export function DocumentPanel() {
  const hasDocument = useDocumentStore((s) => !!s.pdfDoc);
  const isLoading = useDocumentStore((s) => s.isLoading);
  const statusMessage = useDocumentStore((s) => s.statusMessage);

  const busy = isLoading;

  const run = (action: string, fn: () => Promise<void>) => {
    logUserAction(action, action, "info", { metadata: { panel: "document" } });
    void fn().catch((err) => {
      reportError(err, { category: "assembly", userAction: action });
    });
  };

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-2 text-sm">
      <p className="mb-3 text-xs text-zinc-500">
        Combine or divide PDF files. Merged and appended documents open in the editor; split
        results are saved as new files.
      </p>

      <section className="mb-4 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Merge</h3>
        <p className="text-xs text-zinc-500">
          Select two or more PDFs, or one PDF while a document is open, to combine into a new
          document.
        </p>
        <ActionButton disabled={busy} onClick={() => run("merge_pdfs", mergePdfFromDialog)}>
          Merge PDFs…
        </ActionButton>
      </section>

      <section className="mb-4 space-y-2 border-t border-zinc-800 pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Append</h3>
        <p className="text-xs text-zinc-500">
          Add pages from other PDFs to the end of the open document.
        </p>
        <ActionButton
          disabled={busy || !hasDocument}
          onClick={() => run("append_pdfs", mergeIntoCurrentDocument)}
        >
          Append to current…
        </ActionButton>
      </section>

      <section className="space-y-3 border-t border-zinc-800 pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Split</h3>
        <SplitPdfControls />
      </section>

      {statusMessage && (
        <p className="mt-3 border-t border-zinc-800 pt-2 text-xs text-emerald-400/90">
          {statusMessage}
        </p>
      )}
    </div>
  );
}

function ActionButton({
  children,
  disabled,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full rounded bg-zinc-800 px-2 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}
