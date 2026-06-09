import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask } from "@tauri-apps/plugin-dialog";
import { useEffect, useRef } from "react";
import { openPdfFromPath } from "@/services/documentService";
import { checkForUpdatesAndApply } from "@/services/updateService";
import { MenuBar } from "./MenuBar";
import { Toolbar } from "./Toolbar";
import { StatusBar } from "./StatusBar";
import { Sidebar } from "@/components/viewer/Sidebar";
import { PdfViewer } from "@/components/viewer/PdfViewer";
import { SearchBar } from "@/components/search/SearchBar";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useDocumentStore } from "@/stores/documentStore";
import { useUiStore } from "@/stores/uiStore";
import { useContentEditStore } from "@/stores/contentEditStore";
import { LogViewerPanel } from "@/components/debug/LogViewerPanel";
import { APP_NAME } from "@/lib/constants";

export function AppShell() {
  useKeyboardShortcuts();
  const presentationMode = useDocumentStore((s) => s.presentationMode);
  const appMode = useUiStore((s) => s.appMode);
  const reflowWarnings = useContentEditStore((s) => s.reflowWarnings);
  const hasExtractableText = useDocumentStore((s) => s.hasExtractableText);
  const showLogViewer = useUiStore((s) => s.showLogViewer);
  const toggleLogViewer = useUiStore((s) => s.toggleLogViewer);
  const forceClosingRef = useRef(false);
  const startupUpdateCheckedRef = useRef(false);

  useEffect(() => {
    if (startupUpdateCheckedRef.current || import.meta.env.DEV || import.meta.env.VITE_E2E) return;
    startupUpdateCheckedRef.current = true;
    void checkForUpdatesAndApply({
      silentIfUpToDate: true,
      skipIfDirty: true,
      source: "startup",
    });
  }, []);

  useEffect(() => {
    const win = getCurrentWindow();
    const unlistenPromise = win.onCloseRequested(async (event) => {
      // Tauri blocks the OS close button while this listener exists; we must
      // call destroy() ourselves (requires core:window:allow-destroy).
      event.preventDefault();

      if (forceClosingRef.current) {
        await win.destroy();
        return;
      }

      const { isDirty } = useDocumentStore.getState();
      if (isDirty) {
        const discard = await ask(
          "You have unsaved changes. Close without saving?",
          { title: APP_NAME, kind: "warning" },
        );
        if (!discard) return;
        forceClosingRef.current = true;
      }

      await win.destroy();
    });
    return () => {
      void unlistenPromise.then((fn) => fn()).catch(() => {});
    };
  }, []);

  useEffect(() => {
    const win = getCurrentWindow();
    const unlisten = win.onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        const paths = event.payload.paths;
        const pdf = paths.find((p) => p.toLowerCase().endsWith(".pdf"));
        if (pdf) void openPdfFromPath(pdf);
      }
    });
    return () => {
      void unlisten.then((fn) => fn()).catch(() => {});
    };
  }, []);

  useEffect(() => {
    void getCurrentWindow()
      .setFullscreen(presentationMode)
      .catch(() => {
        // Fullscreen may be unavailable during startup or in some hosts.
      });
  }, [presentationMode]);

  if (presentationMode) {
    return (
      <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
        <PdfViewer />
        <button
          type="button"
          className="fixed bottom-4 right-4 rounded bg-zinc-800/80 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700"
          onClick={() => useDocumentStore.getState().togglePresentationMode()}
        >
          Exit presentation (Esc)
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <MenuBar />
      <Toolbar />
      {appMode === "edit" && hasExtractableText === false && (
        <div className="border-b border-sky-800 bg-sky-950/60 px-3 py-2 text-xs text-sky-100">
          This PDF has no selectable text layer (scanned or image-only pages).{" "}
          <span className="font-medium text-white">Edit text</span> cannot change existing
          wording — use <span className="font-medium text-white">Add text (T+)</span> to place
          new text boxes on the page, then save.
        </div>
      )}
      {appMode === "edit" && reflowWarnings.length > 0 && (
        <div className="border-b border-amber-800 bg-amber-950/50 px-3 py-1.5 text-xs text-amber-200">
          {reflowWarnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      )}
      <SearchBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <PdfViewer />
        {showLogViewer && <LogViewerPanel onClose={toggleLogViewer} />}
      </div>
      <StatusBar />
    </div>
  );
}
