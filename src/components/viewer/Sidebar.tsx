import { useDocumentStore } from "@/stores/documentStore";
import type { SidebarTab } from "@shared/types";
import { ThumbnailPanelContent } from "./ThumbnailPanel";
import { OutlinePanel } from "./OutlinePanel";
import { RecentFilesPanel } from "./RecentFilesPanel";
import { MetadataPanel } from "./MetadataPanel";
import { AnnotationsPanel } from "./AnnotationsPanel";
import { FormsPanel } from "@/components/forms/FormsPanel";

const TABS: { id: SidebarTab; label: string }[] = [
  { id: "pages", label: "Pages" },
  { id: "annotations", label: "Marks" },
  { id: "forms", label: "Forms" },
  { id: "outline", label: "Outline" },
  { id: "recent", label: "Recent" },
  { id: "info", label: "Info" },
];

export function Sidebar() {
  const showSidebar = useDocumentStore((s) => s.showSidebar);
  const sidebarTab = useDocumentStore((s) => s.sidebarTab);
  const setSidebarTab = useDocumentStore((s) => s.setSidebarTab);
  const pdfDoc = useDocumentStore((s) => s.pdfDoc);

  if (!showSidebar) return null;

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-zinc-700 bg-zinc-900">
      <div className="flex border-b border-zinc-700 overflow-x-auto">
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
        {sidebarTab === "annotations" && pdfDoc && <AnnotationsPanel />}
        {sidebarTab === "forms" && pdfDoc && <FormsPanel />}
        {sidebarTab === "outline" && pdfDoc && <OutlinePanel />}
        {sidebarTab === "recent" && <RecentFilesPanel />}
        {sidebarTab === "info" && pdfDoc && <MetadataPanel />}
      </div>
    </aside>
  );
}
