import { useCallback, useRef } from "react";
import { PdfPage } from "./PdfPage";
import { useDocumentStore } from "@/stores/documentStore";
import { useAnnotationStore } from "@/stores/annotationStore";
import {
  useAutoZoom,
  useHandPan,
  useScrollToPage,
  useSpacePan,
} from "@/hooks/useViewerControls";

export function PdfViewer() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pdfDoc = useDocumentStore((s) => s.pdfDoc);
  const metadata = useDocumentStore((s) => s.metadata);
  const zoom = useDocumentStore((s) => s.zoom);
  const viewMode = useDocumentStore((s) => s.viewMode);
  const currentPage = useDocumentStore((s) => s.currentPage);
  const setCurrentPage = useDocumentStore((s) => s.setCurrentPage);
  const activeTool = useAnnotationStore((s) => s.activeTool);

  useAutoZoom(scrollRef);
  useScrollToPage(scrollRef);
  const spaceHeld = useSpacePan();
  useHandPan(scrollRef, (activeTool === "hand" || spaceHeld) && !!pdfDoc);

  const onVisible = useCallback(
    (pageNumber: number) => {
      if (viewMode === "continuous" || viewMode === "spread") {
        setCurrentPage(pageNumber);
      }
    },
    [viewMode, setCurrentPage],
  );

  if (!pdfDoc || !metadata) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-zinc-400">
        <p className="text-lg">Open a PDF to get started</p>
        <p className="text-sm">Click Open, use File → Open, or drag and drop a PDF</p>
      </div>
    );
  }

  const pages = Array.from({ length: metadata.pageCount }, (_, i) => i + 1);

  if (viewMode === "single") {
    return (
      <div ref={scrollRef} data-testid="pdf-viewer" className="flex-1 overflow-auto bg-zinc-800 p-6">
        <PdfPage pageNumber={currentPage} scale={zoom} />
      </div>
    );
  }

  if (viewMode === "spread") {
    return (
      <div ref={scrollRef} data-testid="pdf-viewer" className="flex-1 overflow-auto bg-zinc-800 p-6">
      {Array.from({ length: Math.ceil(pages.length / 2) }, (_, pairIndex) => {
        const left = pairIndex * 2 + 1;
        const right = left + 1;
        return (
          <div key={left} className="mb-4 flex justify-center gap-4" data-page={left}>
            <PdfPage pageNumber={left} scale={zoom} onVisible={onVisible} />
            {right <= pages.length ? (
              <PdfPage pageNumber={right} scale={zoom} onVisible={onVisible} />
            ) : (
              <div className="w-[200px]" aria-hidden />
            )}
          </div>
        );
      })}
    </div>
  );
  }

  return (
    <div ref={scrollRef} data-testid="pdf-viewer" className="flex-1 overflow-auto bg-zinc-800 p-6">
      {pages.map((num) => (
        <PdfPage key={num} pageNumber={num} scale={zoom} onVisible={onVisible} />
      ))}
    </div>
  );
}
