import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getPageLinks } from "@/lib/pdf/pdfEngine";
import { useDocumentStore } from "@/stores/documentStore";
import { useUiStore } from "@/stores/uiStore";

interface ViewportLink {
  left: number;
  top: number;
  width: number;
  height: number;
  url?: string;
  destPageIndex?: number;
}

interface LinkLayerProps {
  pageNumber: number;
  scale: number;
}

export function LinkLayer({ pageNumber, scale }: LinkLayerProps) {
  const pdfDoc = useDocumentStore((s) => s.pdfDoc);
  const rotation = useDocumentStore((s) => s.rotation);
  const setCurrentPage = useDocumentStore((s) => s.setCurrentPage);
  const appMode = useUiStore((s) => s.appMode);
  const [links, setLinks] = useState<ViewportLink[]>([]);
  const linksInteractive = appMode === "markup";

  useEffect(() => {
    if (!pdfDoc) {
      setLinks([]);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        const viewport = page.getViewport({ scale, rotation });
        const pageLinks = await getPageLinks(page, pdfDoc);
        const converted = pageLinks.map((link) => {
          const [x1, y1, x2, y2] = viewport.convertToViewportRectangle([
            link.rect.x,
            link.rect.y,
            link.rect.x + link.rect.width,
            link.rect.y + link.rect.height,
          ]);
          return {
            left: Math.min(x1, x2),
            top: Math.min(y1, y2),
            width: Math.abs(x2 - x1),
            height: Math.abs(y2 - y1),
            url: link.url,
            destPageIndex: link.destPageIndex,
          };
        });
        if (!cancelled) setLinks(converted);
      } catch {
        if (!cancelled) setLinks([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageNumber, scale, rotation]);

  const handleClick = async (link: ViewportLink, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (link.url) {
      await openUrl(link.url);
      return;
    }
    if (link.destPageIndex !== undefined) {
      setCurrentPage(link.destPageIndex + 1, { scroll: true });
    }
  };

  return (
    <>
      {links.map((link, i) => (
        <a
          key={i}
          href={link.url ?? "#"}
          title={link.url ?? "Go to page"}
          className="absolute bg-transparent"
          style={{
            left: link.left,
            top: link.top,
            width: link.width,
            height: link.height,
            pointerEvents: linksInteractive ? "auto" : "none",
            cursor: linksInteractive ? "pointer" : "default",
          }}
          onClick={(e) => void handleClick(link, e)}
        />
      ))}
    </>
  );
}
