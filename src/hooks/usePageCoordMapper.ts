import { useEffect, useState } from "react";
import { createViewportCoordMapper, type ViewportCoordMapper } from "@/lib/pdf/viewportCoords";
import { useDocumentStore, type PageRotation } from "@/stores/documentStore";

export function usePageCoordMapper(
  pageNumber: number,
  rotation: PageRotation,
): ViewportCoordMapper | null {
  const pdfDoc = useDocumentStore((s) => s.pdfDoc);
  const [mapper, setMapper] = useState<ViewportCoordMapper | null>(null);

  useEffect(() => {
    if (!pdfDoc) {
      setMapper(null);
      return;
    }

    let cancelled = false;
    void pdfDoc.getPage(pageNumber).then((page) => {
      if (cancelled) return;
      setMapper(createViewportCoordMapper(page, rotation));
    });

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageNumber, rotation]);

  return mapper;
}
