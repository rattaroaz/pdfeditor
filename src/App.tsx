import { AppShell } from "@/components/layout/AppShell";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { ErrorDialog } from "@/components/common/ErrorDialog";
import { SplitPdfDialog } from "@/components/document/SplitPdfDialog";
import { HelpGuideDialog } from "@/components/help/HelpGuideDialog";
import { useUiStore } from "@/stores/uiStore";
import { useDocumentStore } from "@/stores/documentStore";
import "./index.css";

function App() {
  const showError = useUiStore((s) => s.showError);
  const isLoading = useDocumentStore((s) => s.isLoading);

  return (
    <div data-testid="app-root" className="contents">
    <ErrorBoundary
      onError={(errorId, message) =>
        showError({ errorId, message })
      }
    >
      {isLoading && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="rounded-lg bg-zinc-900 px-6 py-4 text-sm">Loading PDF…</div>
        </div>
      )}
      <AppShell />
      <ErrorDialog />
      <SplitPdfDialog />
      <HelpGuideDialog />
    </ErrorBoundary>
    </div>
  );
}

export default App;
