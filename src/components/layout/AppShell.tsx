import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";
import { openPdfFromPath } from "@/services/documentService";
import { MenuBar } from "./MenuBar";
import { Toolbar } from "./Toolbar";
import { StatusBar } from "./StatusBar";
import { ModeToolbar } from "./ModeToolbar";
import { ToolPalette } from "@/components/annotations/ToolPalette";
import { Sidebar } from "@/components/viewer/Sidebar";
import { PdfViewer } from "@/components/viewer/PdfViewer";
import { SearchBar } from "@/components/search/SearchBar";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useDocumentStore } from "@/stores/documentStore";
import { useUiStore } from "@/stores/uiStore";
import { useContentEditStore } from "@/stores/contentEditStore";

export function AppShell() {
  useKeyboardShortcuts();
  const presentationMode = useDocumentStore((s) => s.presentationMode);
  const appMode = useUiStore((s) => s.appMode);
  const reflowWarnings = useContentEditStore((s) => s.reflowWarnings);

  useEffect(() => {
    const win = getCurrentWindow();
    const unlistenPromise = win.onCloseRequested(async (event) => {
      const { isDirty } = useDocumentStore.getState();
      if (!isDirty) return;
      event.preventDefault();
      const discard = window.confirm(
        "You have unsaved changes. Close without saving?",
      );
      if (discard) {
        await win.close();
      }
    });
    return () => {
      void unlistenPromise.then((fn) => fn());
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
      void unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    void getCurrentWindow().setFullscreen(presentationMode);
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
      <ModeToolbar />
      {appMode === "markup" && <ToolPalette />}
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
      </div>
      <StatusBar />
    </div>
  );
}
