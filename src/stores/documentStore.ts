import { create } from "zustand";
import type { PdfDocument } from "@/lib/pdf/pdfEngine";
import type { PdfMetadata, SidebarTab, ViewMode, ZoomMode } from "@shared/types";
import { DEFAULT_ZOOM, SIDEBAR_WIDTH_DEFAULT, SIDEBAR_WIDTH_MAX, SIDEBAR_WIDTH_MIN, ZOOM_MAX, ZOOM_MIN } from "@/lib/constants";
import { fileNameFromPath } from "@/lib/pdf/pdfBinary";
import { v4 as uuidv4 } from "uuid";

export type PageRotation = 0 | 90 | 180 | 270;

interface DocumentStore {
  documentId: string | null;
  filePath: string | null;
  fileName: string;
  pdfDoc: PdfDocument | null;
  pdfBytes: Uint8Array | null;
  savedPdfBytes: Uint8Array | null;
  basePdfBytes: Uint8Array | null;
  metadata: PdfMetadata | null;
  isDirty: boolean;
  isLoading: boolean;
  loadError: string | null;
  currentPage: number;
  scrollToPage: number | null;
  scrollTarget: { pageNumber: number; pdfX: number; pdfY: number } | null;
  zoom: number;
  zoomMode: ZoomMode;
  viewMode: ViewMode;
  rotation: PageRotation;
  showSidebar: boolean;
  sidebarWidth: number;
  sidebarTab: SidebarTab;
  presentationMode: boolean;
  hasExtractableText: boolean | null;
  setLoading: (loading: boolean) => void;
  setLoadError: (error: string | null) => void;
  setDocument: (args: {
    filePath: string;
    fileName: string;
    pdfDoc: PdfDocument;
    pdfBytes: Uint8Array;
    metadata: PdfMetadata;
  }) => void;
  clearDocument: () => void;
  setDirty: (dirty: boolean) => void;
  setCurrentPage: (page: number, options?: { scroll?: boolean }) => void;
  clearScrollRequest: () => void;
  requestScrollToTarget: (target: { pageNumber: number; pdfX: number; pdfY: number }) => void;
  clearScrollTarget: () => void;
  setZoom: (zoom: number) => void;
  setZoomMode: (mode: ZoomMode) => void;
  setViewMode: (mode: ViewMode) => void;
  rotateClockwise: () => void;
  rotateCounterClockwise: () => void;
  toggleSidebar: () => void;
  setShowSidebar: (show: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  togglePresentationMode: () => void;
  applySavedDocument: (args: {
    filePath: string;
    pdfDoc: PdfDocument;
    pdfBytes: Uint8Array;
  }) => void;
  applyPdfStructureChange: (args: {
    pdfDoc: PdfDocument;
    pdfBytes: Uint8Array;
    pageCount: number;
  }) => void;
  setStatusMessage: (message: string | null) => void;
  setHasExtractableText: (value: boolean | null) => void;
  statusMessage: string | null;
  isPasswordProtected: boolean;
  documentPassword: string | null;
  pendingSavePassword: string | null;
  removePasswordOnSave: boolean;
  setPasswordProtected: (value: boolean) => void;
  setDocumentPassword: (password: string | null) => void;
  setPendingSavePassword: (password: string | null) => void;
  setRemovePasswordOnSave: (value: boolean) => void;
  clearSecuritySaveFlags: () => void;
}

export const useDocumentStore = create<DocumentStore>((set, get) => ({
  documentId: null,
  filePath: null,
  fileName: "Untitled",
  pdfDoc: null,
  pdfBytes: null,
  savedPdfBytes: null,
  basePdfBytes: null,
  metadata: null,
  isDirty: false,
  isLoading: false,
  loadError: null,
  currentPage: 1,
  scrollToPage: null,
  scrollTarget: null,
  zoom: DEFAULT_ZOOM,
  zoomMode: "custom",
  viewMode: "continuous",
  rotation: 0,
  showSidebar: true,
  sidebarWidth: SIDEBAR_WIDTH_DEFAULT,
  sidebarTab: "pages",
  presentationMode: false,
  hasExtractableText: null,
  statusMessage: null,
  isPasswordProtected: false,
  documentPassword: null,
  pendingSavePassword: null,
  removePasswordOnSave: false,

  setLoading: (isLoading) => set({ isLoading }),
  setLoadError: (loadError) => set({ loadError }),
  setDocument: ({ filePath, fileName, pdfDoc, pdfBytes, metadata }) =>
    set({
      documentId: uuidv4(),
      filePath,
      fileName,
      pdfDoc,
      pdfBytes,
      savedPdfBytes: pdfBytes.slice(),
      basePdfBytes: pdfBytes.slice(),
      metadata,
      isDirty: false,
      isLoading: false,
      loadError: null,
      currentPage: 1,
      scrollToPage: 1,
      rotation: 0,
      isPasswordProtected: !!metadata.isPasswordProtected,
      documentPassword: null,
      pendingSavePassword: null,
      removePasswordOnSave: false,
      hasExtractableText: null,
    }),
  clearDocument: () =>
    set({
      documentId: null,
      filePath: null,
      fileName: "Untitled",
      pdfDoc: null,
      pdfBytes: null,
      savedPdfBytes: null,
      basePdfBytes: null,
      metadata: null,
      isDirty: false,
      loadError: null,
      currentPage: 1,
      scrollToPage: null,
      rotation: 0,
      presentationMode: false,
      isPasswordProtected: false,
      documentPassword: null,
      pendingSavePassword: null,
      removePasswordOnSave: false,
      hasExtractableText: null,
    }),
  setDirty: (isDirty) => set({ isDirty }),
  setCurrentPage: (page, options) => {
    const total = get().metadata?.pageCount ?? 1;
    const currentPage = Math.min(Math.max(1, page), total);
    set({
      currentPage,
      scrollToPage: options?.scroll ? currentPage : get().scrollToPage,
    });
  },
  clearScrollRequest: () => set({ scrollToPage: null }),
  requestScrollToTarget: (target) => {
    const total = get().metadata?.pageCount ?? 1;
    const pageNumber = Math.min(Math.max(1, target.pageNumber), total);
    set({
      currentPage: pageNumber,
      scrollToPage: pageNumber,
      scrollTarget: target,
    });
  },
  clearScrollTarget: () => set({ scrollTarget: null }),
  setZoom: (zoom) =>
    set({
      zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom)),
      zoomMode: "custom",
    }),
  setZoomMode: (zoomMode) => set({ zoomMode }),
  setViewMode: (viewMode) => set({ viewMode }),
  rotateClockwise: () =>
    set((s) => ({
      rotation: ((s.rotation + 90) % 360) as PageRotation,
      zoomMode: "custom",
    })),
  rotateCounterClockwise: () =>
    set((s) => ({
      rotation: ((s.rotation + 270) % 360) as PageRotation,
      zoomMode: "custom",
    })),
  toggleSidebar: () => set((s) => ({ showSidebar: !s.showSidebar })),
  setShowSidebar: (showSidebar) => set({ showSidebar }),
  setSidebarWidth: (sidebarWidth) =>
    set({
      sidebarWidth: Math.min(
        SIDEBAR_WIDTH_MAX,
        Math.max(SIDEBAR_WIDTH_MIN, Math.round(sidebarWidth)),
      ),
    }),
  setSidebarTab: (sidebarTab) => set({ sidebarTab, showSidebar: true }),
  togglePresentationMode: () =>
    set((s) => ({ presentationMode: !s.presentationMode })),
  applySavedDocument: ({ filePath, pdfDoc, pdfBytes }) => {
    const currentPage = get().currentPage;
    set({
      filePath,
      fileName: fileNameFromPath(filePath, get().fileName),
      pdfDoc,
      pdfBytes,
      basePdfBytes: pdfBytes.slice(),
      savedPdfBytes: pdfBytes.slice(),
      isDirty: false,
      statusMessage: "Saved",
      currentPage,
    });
  },
  applyPdfStructureChange: ({ pdfDoc, pdfBytes, pageCount }) => {
    const currentPage = Math.min(get().currentPage, pageCount);
    set((s) => ({
      pdfDoc,
      pdfBytes,
      basePdfBytes: pdfBytes.slice(),
      metadata: s.metadata
        ? { ...s.metadata, pageCount, fileSize: pdfBytes.byteLength }
        : { pageCount, fileSize: pdfBytes.byteLength },
      isDirty: true,
      currentPage,
      scrollToPage: currentPage,
      rotation: s.rotation,
    }));
  },
  setStatusMessage: (statusMessage) => set({ statusMessage }),
  setHasExtractableText: (hasExtractableText) => set({ hasExtractableText }),
  setPasswordProtected: (isPasswordProtected) =>
    set((s) => ({
      isPasswordProtected,
      metadata: s.metadata ? { ...s.metadata, isPasswordProtected } : s.metadata,
    })),
  setDocumentPassword: (documentPassword) => set({ documentPassword }),
  setPendingSavePassword: (pendingSavePassword) => set({ pendingSavePassword }),
  setRemovePasswordOnSave: (removePasswordOnSave) => set({ removePasswordOnSave }),
  clearSecuritySaveFlags: () =>
    set({ pendingSavePassword: null, removePasswordOnSave: false }),
}));
