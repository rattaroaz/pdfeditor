import { useEffect, useRef, useState, useCallback } from "react";
import { renderPageToCanvas } from "@/lib/pdf/pdfEngine";
import { useDocumentStore } from "@/stores/documentStore";
import { AnnotationLayer } from "@/components/annotations/AnnotationLayer";
import { ContentEditLayer } from "@/components/edit/ContentEditLayer";
import { PdfFormLayer } from "@/components/forms/PdfFormLayer";
import { PdfTextLayer } from "./PdfTextLayer";
import { LinkLayer } from "./LinkLayer";
import { SearchHighlightLayer } from "@/components/search/SearchHighlightLayer";

interface PdfPageProps {
  pageNumber: number;
  scale: number;
  onVisible?: (pageNumber: number) => void;
}

export function PdfPage({ pageNumber, scale, onVisible }: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDoc = useDocumentStore((s) => s.pdfDoc);
  const rotation = useDocumentStore((s) => s.rotation);
  const [rendering, setRendering] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);

  const render = useCallback(
    async (signal: AbortSignal) => {
      if (!pdfDoc || !canvasRef.current) return;
      setRendering(true);
      setRenderError(null);
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (signal.aborted || !canvasRef.current) return;
        await renderPageToCanvas(page, canvasRef.current, scale, signal, rotation);
      } catch (err) {
        if (signal.aborted) return;
        const message = err instanceof Error ? err.message : "Render failed";
        setRenderError(message);
      } finally {
        if (!signal.aborted) setRendering(false);
      }
    },
    [pdfDoc, pageNumber, scale, rotation],
  );

  useEffect(() => {
    const controller = new AbortController();
    void render(controller.signal);
    return () => controller.abort();
  }, [render]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !onVisible) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) onVisible(pageNumber);
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [pageNumber, onVisible]);

  return (
    <div
      ref={containerRef}
      className="relative mx-auto mb-4 shadow-lg"
      data-page={pageNumber}
    >
      <canvas ref={canvasRef} className="block bg-white" />
      <AnnotationLayer pageIndex={pageNumber - 1} scale={scale} />
      <ContentEditLayer pageIndex={pageNumber - 1} scale={scale} />
      <PdfTextLayer pageNumber={pageNumber} scale={scale} />
      <SearchHighlightLayer pageNumber={pageNumber} scale={scale} />
      <LinkLayer pageNumber={pageNumber} scale={scale} />
      <PdfFormLayer pageNumber={pageNumber} scale={scale} canvasRef={canvasRef} />
      {rendering && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/50 text-xs text-zinc-500">
          Rendering…
        </div>
      )}
      {renderError && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-50 p-4 text-center text-xs text-red-600">
          Page {pageNumber}: {renderError}
        </div>
      )}
    </div>
  );
}
