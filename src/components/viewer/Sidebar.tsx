import { useEffect, useRef } from "react";
import { useDocumentStore } from "@/stores/documentStore";
import type { SidebarTab } from "@shared/types";
import { ThumbnailPanelContent } from "./ThumbnailPanel";
import { OutlinePanel } from "./OutlinePanel";
import { RecentFilesPanel } from "./RecentFilesPanel";
import { MetadataPanel } from "./MetadataPanel";
import { AnnotationsPanel } from "./AnnotationsPanel";
import { FormsPanel } from "@/components/forms/FormsPanel";
import { DocumentPanel } from "@/components/document/DocumentPanel";

const TABS: { id: SidebarTab; label: string }[] = [
  { id: "pages", label: "Pages" },
  { id: "document", label: "Document" },
  { id: "annotations", label: "Marks" },
  { id: "forms", label: "Forms" },
  { id: "outline", label: "Outline" },
  { id: "recent", label: "Recent" },
  { id: "info", label: "Info" },
];

export function Sidebar() {
  const showSidebar = useDocumentStore((s) => s.showSidebar);
  const sidebarWidth = useDocumentStore((s) => s.sidebarWidth);
  const sidebarTab = useDocumentStore((s) => s.sidebarTab);
  const setSidebarTab = useDocumentStore((s) => s.setSidebarTab);
  const setSidebarWidth = useDocumentStore((s) => s.setSidebarWidth);
  const pdfDoc = useDocumentStore((s) => s.pdfDoc);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      setSidebarWidth(drag.startWidth + (e.clientX - drag.startX));
    };
    const onUp = () => {
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [setSidebarWidth]);

  const beginResize = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: sidebarWidth };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  return (
    <aside
      data-testid="sidebar"
      aria-hidden={!showSidebar}
      className="relative flex shrink-0 flex-col overflow-hidden border-r border-zinc-700 bg-zinc-900 transition-[width] duration-200 ease-out"
      style={{
        width: showSidebar ? sidebarWidth : 0,
        minWidth: 0,
        borderRightWidth: showSidebar ? undefined : 0,
      }}
    >
      {showSidebar && (
        <>
          <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex overflow-x-auto border-b border-zinc-700">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSidebarTab(tab.id)}
                  className={`shrink-0 px-1.5 py-2 text-[10px] font-medium uppercase tracking-wide ${
                    sidebarTab === tab.id
                      ? "border-b-2 border-blue-500 text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {sidebarTab === "pages" && pdfDoc && <ThumbnailPanelContent />}
              {sidebarTab === "document" && <DocumentPanel />}
              {sidebarTab === "annotations" && pdfDoc && <AnnotationsPanel />}
              {sidebarTab === "forms" && pdfDoc && <FormsPanel />}
              {sidebarTab === "outline" && pdfDoc && <OutlinePanel />}
              {sidebarTab === "recent" && <RecentFilesPanel />}
              {sidebarTab === "info" && pdfDoc && <MetadataPanel />}
            </div>
          </div>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            data-testid="sidebar-resize-handle"
            title="Drag to resize sidebar"
            className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none hover:bg-blue-500/40 active:bg-blue-500/60"
            onMouseDown={beginResize}
          />
        </>
      )}
    </aside>
  );
}
