import { useRef, useEffect, useState, type RefObject } from "react";
import type { PdfDocument } from "@/lib/pdf/pdfEngine";
import { useDocumentStore } from "@/stores/documentStore";
import { ZOOM_MAX, ZOOM_MIN } from "@/lib/constants";

const VIEWER_PADDING = 48;

export async function computeFitZoom(
  pdfDoc: PdfDocument,
  pageNumber: number,
  containerWidth: number,
  containerHeight: number,
  mode: "fit-width" | "fit-page",
  rotation = 0,
): Promise<number> {
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1, rotation });
  const availableWidth = Math.max(containerWidth - VIEWER_PADDING, 100);
  const availableHeight = Math.max(containerHeight - VIEWER_PADDING, 100);

  if (mode === "fit-width") {
    return availableWidth / viewport.width;
  }

  return Math.min(
    availableWidth / viewport.width,
    availableHeight / viewport.height,
  );
}

export function useAutoZoom(viewportRef: RefObject<HTMLElement | null>) {
  const pdfDoc = useDocumentStore((s) => s.pdfDoc);
  const currentPage = useDocumentStore((s) => s.currentPage);
  const zoomMode = useDocumentStore((s) => s.zoomMode);
  const rotation = useDocumentStore((s) => s.rotation);

  useEffect(() => {
    if (!pdfDoc || !viewportRef.current) return;
    if (zoomMode !== "fit-width" && zoomMode !== "fit-page") return;

    const el = viewportRef.current;
    let cancelled = false;

    const apply = async () => {
      const next = await computeFitZoom(
        pdfDoc,
        currentPage,
        el.clientWidth,
        el.clientHeight,
        zoomMode,
        rotation,
      );
      if (!cancelled) {
        useDocumentStore.setState({
          zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)),
        });
      }
    };

    void apply();

    const observer = new ResizeObserver(() => {
      void apply();
    });
    observer.observe(el);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [pdfDoc, currentPage, zoomMode, rotation, viewportRef]);
}

export function useScrollToPage(viewportRef: RefObject<HTMLElement | null>) {
  const scrollToPage = useDocumentStore((s) => s.scrollToPage);
  const clearScrollRequest = useDocumentStore((s) => s.clearScrollRequest);

  useEffect(() => {
    if (!scrollToPage || !viewportRef.current) return;

    const target = viewportRef.current.querySelector(
      `[data-page="${scrollToPage}"]`,
    );
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    clearScrollRequest();
  }, [scrollToPage, clearScrollRequest, viewportRef]);
}

export function useHandPan(
  viewportRef: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  const panRef = useRef<{
    active: boolean;
    x: number;
    y: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !enabled) return;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      panRef.current = {
        active: true,
        x: e.clientX,
        y: e.clientY,
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
      };
      el.style.cursor = "grabbing";
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!panRef.current?.active) return;
      const dx = e.clientX - panRef.current.x;
      const dy = e.clientY - panRef.current.y;
      el.scrollLeft = panRef.current.scrollLeft - dx;
      el.scrollTop = panRef.current.scrollTop - dy;
    };

    const onMouseUp = () => {
      if (panRef.current?.active) {
        panRef.current.active = false;
        el.style.cursor = "grab";
      }
    };

    el.style.cursor = "grab";
    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      el.style.cursor = "";
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [viewportRef, enabled]);
}

export function useSpacePan(): boolean {
  const [spaceHeld, setSpaceHeld] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target as HTMLElement).matches("input, textarea")) {
        e.preventDefault();
        setSpaceHeld(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHeld(false);
    };
    const onBlur = () => setSpaceHeld(false);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  return spaceHeld;
}
