import { useEffect } from "react";
import { openPdfFromDialog, savePdf, persistAnnotations } from "@/services/documentService";
import { useDocumentStore } from "@/stores/documentStore";
import { useUiStore } from "@/stores/uiStore";
import { useAnnotationStore } from "@/stores/annotationStore";
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from "@/lib/constants";

export function useKeyboardShortcuts() {
  const setZoom = useDocumentStore((s) => s.setZoom);
  const zoom = useDocumentStore((s) => s.zoom);
  const setCurrentPage = useDocumentStore((s) => s.setCurrentPage);
  const currentPage = useDocumentStore((s) => s.currentPage);
  const hasDocument = useDocumentStore((s) => !!s.pdfDoc);
  const presentationMode = useDocumentStore((s) => s.presentationMode);
  const togglePresentationMode = useDocumentStore((s) => s.togglePresentationMode);
  const toggleSearch = useUiStore((s) => s.toggleSearch);
  const undo = useAnnotationStore((s) => s.undo);
  const redo = useAnnotationStore((s) => s.redo);
  const removeAnnotation = useAnnotationStore((s) => s.removeAnnotation);
  const selectedId = useAnnotationStore((s) => s.selectedId);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (e.key === "Escape" && presentationMode) {
        e.preventDefault();
        togglePresentationMode();
        return;
      }

      if (mod && e.key === "o") {
        e.preventDefault();
        void openPdfFromDialog();
        return;
      }
      if (mod && e.key === "s") {
        e.preventDefault();
        void savePdf(e.shiftKey);
        return;
      }
      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        void persistAnnotations();
        return;
      }
      if (mod && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
        void persistAnnotations();
        return;
      }
      if (mod && e.key === "c" && !typing) {
        const selection = window.getSelection()?.toString();
        if (selection) {
          e.preventDefault();
          void navigator.clipboard.writeText(selection);
        }
        return;
      }
      if (typing) return;

      if (mod && e.key === "f") {
        e.preventDefault();
        toggleSearch();
      }
      if (mod && e.key === "a" && hasDocument) {
        const textLayer = document.querySelector(".textLayer");
        if (textLayer) {
          e.preventDefault();
          const range = document.createRange();
          range.selectNodeContents(textLayer);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      }
      if (!hasDocument) return;

      if (e.key === "F11") {
        e.preventDefault();
        togglePresentationMode();
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId) {
          e.preventDefault();
          removeAnnotation(selectedId);
          void persistAnnotations();
        }
      }
      if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        setZoom(Math.min(ZOOM_MAX, zoom + ZOOM_STEP));
      }
      if (mod && e.key === "-") {
        e.preventDefault();
        setZoom(Math.max(ZOOM_MIN, zoom - ZOOM_STEP));
      }
      if (mod && e.key === "0") {
        e.preventDefault();
        setZoom(1);
      }
      if (e.key === "PageDown") {
        e.preventDefault();
        setCurrentPage(currentPage + 1, { scroll: true });
      }
      if (e.key === "PageUp") {
        e.preventDefault();
        setCurrentPage(currentPage - 1, { scroll: true });
      }
      if (mod && e.key === "g") {
        e.preventDefault();
        const input = window.prompt("Go to page:", String(currentPage));
        if (input) setCurrentPage(Number(input), { scroll: true });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    zoom,
    currentPage,
    hasDocument,
    presentationMode,
    selectedId,
    setZoom,
    setCurrentPage,
    toggleSearch,
    togglePresentationMode,
    undo,
    redo,
    removeAnnotation,
  ]);
}
