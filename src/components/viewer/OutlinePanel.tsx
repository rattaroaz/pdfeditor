import { useEffect, useState } from "react";
import { getDocumentOutline } from "@/lib/pdf/pdfEngine";
import { useDocumentStore } from "@/stores/documentStore";
import type { OutlineItem } from "@shared/types";

export function OutlinePanel() {
  const pdfDoc = useDocumentStore((s) => s.pdfDoc);
  const setCurrentPage = useDocumentStore((s) => s.setCurrentPage);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pdfDoc) {
      setOutline([]);
      return;
    }
    let cancelled = false;
    setLoading(true);

    void getDocumentOutline(pdfDoc).then((items) => {
      if (!cancelled) {
        setOutline(items);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [pdfDoc]);

  if (loading) {
    return <p className="p-3 text-xs text-zinc-500">Loading outline…</p>;
  }

  if (outline.length === 0) {
    return <p className="p-3 text-xs text-zinc-500">No bookmarks in this document.</p>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-2 text-sm">
      {outline.map((item, i) => (
        <OutlineNode
          key={`${item.title}-${item.pageIndex}-${i}`}
          item={item}
          onNavigate={(page) => setCurrentPage(page, { scroll: true })}
        />
      ))}
    </div>
  );
}

function OutlineNode({
  item,
  onNavigate,
}: {
  item: OutlineItem;
  onNavigate: (page: number) => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={() => onNavigate(item.pageIndex + 1)}
        className="block w-full truncate rounded px-2 py-1 text-left text-zinc-300 hover:bg-zinc-800"
        style={{ paddingLeft: `${8 + item.level * 12}px` }}
        title={item.title}
      >
        {item.title}
      </button>
      {item.children.map((child, i) => (
        <OutlineNode
          key={`${child.title}-${child.pageIndex}-${i}`}
          item={child}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}
