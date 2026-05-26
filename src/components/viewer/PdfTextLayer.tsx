import { useEffect, useRef } from "react";
import { renderTextLayer } from "@/lib/pdf/pdfEngine";
import { useDocumentStore } from "@/stores/documentStore";
import { useAnnotationStore } from "@/stores/annotationStore";
import { useUiStore } from "@/stores/uiStore";
import "pdfjs-dist/web/pdf_viewer.css";

interface TextLayerProps {
  pageNumber: number;
  scale: number;
}

export function PdfTextLayer({ pageNumber, scale }: TextLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDoc = useDocumentStore((s) => s.pdfDoc);
  const rotation = useDocumentStore((s) => s.rotation);
  const activeTool = useAnnotationStore((s) => s.activeTool);
  const appMode = useUiStore((s) => s.appMode);

  useEffect(() => {
    if (!pdfDoc || !containerRef.current) return;
    const controller = new AbortController();
    let textLayer: Awaited<ReturnType<typeof renderTextLayer>> | null = null;

    (async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (controller.signal.aborted || !containerRef.current) return;
        textLayer = await renderTextLayer(
          page,
          containerRef.current,
          scale,
          rotation,
          controller.signal,
        );
      } catch {
        // cancelled renders are expected
      }
    })();

    return () => {
      controller.abort();
      textLayer?.cancel();
    };
  }, [pdfDoc, pageNumber, scale, rotation]);

  const selectable =
    appMode === "markup" && (activeTool === "select" || activeTool === "text");

  return (
    <div
      ref={containerRef}
      className="textLayer absolute left-0 top-0"
      style={{ pointerEvents: selectable ? "auto" : "none" }}
    />
  );
}
