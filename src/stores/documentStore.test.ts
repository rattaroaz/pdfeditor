import { describe, expect, it } from "vitest";
import { SIDEBAR_WIDTH_MAX, SIDEBAR_WIDTH_MIN } from "@/lib/constants";
import { useDocumentStore } from "./documentStore";

describe("documentStore", () => {
  it("initializes with empty document", () => {
    const state = useDocumentStore.getState();
    expect(state.pdfDoc).toBeNull();
    expect(state.fileName).toBe("Untitled");
    expect(state.currentPage).toBe(1);
  });

  it("clamps page navigation", () => {
    useDocumentStore.setState({
      metadata: {
        pageCount: 5,
        fileSize: 1000,
      },
    });
    useDocumentStore.getState().setCurrentPage(99);
    expect(useDocumentStore.getState().currentPage).toBe(5);
    useDocumentStore.getState().setCurrentPage(0);
    expect(useDocumentStore.getState().currentPage).toBe(1);
  });

  it("requests scroll when navigating with scroll option", () => {
    useDocumentStore.setState({
      metadata: { pageCount: 10, fileSize: 1000 },
      scrollToPage: null,
    });
    useDocumentStore.getState().setCurrentPage(3, { scroll: true });
    expect(useDocumentStore.getState().currentPage).toBe(3);
    expect(useDocumentStore.getState().scrollToPage).toBe(3);
  });

  it("toggles and clamps sidebar width", () => {
    useDocumentStore.setState({ showSidebar: true, sidebarWidth: 200 });
    useDocumentStore.getState().toggleSidebar();
    expect(useDocumentStore.getState().showSidebar).toBe(false);
    useDocumentStore.getState().setSidebarWidth(999);
    expect(useDocumentStore.getState().sidebarWidth).toBe(SIDEBAR_WIDTH_MAX);
    useDocumentStore.getState().setSidebarWidth(50);
    expect(useDocumentStore.getState().sidebarWidth).toBe(SIDEBAR_WIDTH_MIN);
  });

  it("preserves rotation when PDF structure changes", () => {
    useDocumentStore.setState({
      rotation: 90,
      metadata: { pageCount: 3, fileSize: 1000 },
      currentPage: 2,
    });
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    useDocumentStore.getState().applyPdfStructureChange({
      pdfDoc: {} as never,
      pdfBytes: bytes,
      pageCount: 5,
    });
    expect(useDocumentStore.getState().rotation).toBe(90);
    expect(useDocumentStore.getState().currentPage).toBe(2);
    expect(useDocumentStore.getState().isDirty).toBe(true);
  });

  it("tracks dirty state via markDocumentChanged and markDocumentSaved", () => {
    useDocumentStore.setState({ isDirty: false, statusMessage: null });
    useDocumentStore.getState().markDocumentChanged();
    expect(useDocumentStore.getState().isDirty).toBe(true);

    useDocumentStore.getState().markDocumentSaved("Saved to disk");
    expect(useDocumentStore.getState().isDirty).toBe(false);
    expect(useDocumentStore.getState().statusMessage).toBe("Saved to disk");
  });

  it("setDocument copies byte baselines and resets navigation", () => {
    const viewBytes = new Uint8Array([1, 2, 3]);
    const baseBytes = new Uint8Array([4, 5, 6]);
    const savedBytes = new Uint8Array([7, 8, 9]);

    useDocumentStore.getState().setDocument({
      filePath: "C:\\docs\\sample.pdf",
      fileName: "sample.pdf",
      pdfDoc: {} as never,
      pdfBytes: viewBytes,
      basePdfBytes: baseBytes,
      savedPdfBytes: savedBytes,
      metadata: { pageCount: 2, fileSize: 3, isPasswordProtected: true },
      documentPassword: "secret",
    });

    const state = useDocumentStore.getState();
    expect(state.documentId).toBeTruthy();
    expect(state.pdfBytes).toEqual(viewBytes);
    expect(state.basePdfBytes).toEqual(baseBytes);
    expect(state.savedPdfBytes).toEqual(savedBytes);
    expect(state.basePdfBytes).not.toBe(baseBytes);
    expect(state.isDirty).toBe(false);
    expect(state.currentPage).toBe(1);
    expect(state.scrollToPage).toBe(1);
    expect(state.rotation).toBe(0);
    expect(state.documentPassword).toBe("secret");
    expect(state.isPasswordProtected).toBe(true);
  });

  it("applySavedDocument updates baselines without changing page", () => {
    const oldBytes = new Uint8Array([1, 2, 3]);
    const newBytes = new Uint8Array([9, 8, 7]);
    useDocumentStore.setState({
      currentPage: 3,
      metadata: { pageCount: 5, fileSize: 3 },
      isDirty: true,
      pdfBytes: oldBytes,
      basePdfBytes: oldBytes,
      savedPdfBytes: oldBytes,
    });

    useDocumentStore.getState().applySavedDocument({
      filePath: "C:\\docs\\renamed.pdf",
      pdfDoc: {} as never,
      pdfBytes: newBytes,
      metadata: { pageCount: 5, fileSize: 3 },
    });

    const state = useDocumentStore.getState();
    expect(state.filePath).toBe("C:\\docs\\renamed.pdf");
    expect(state.fileName).toBe("renamed.pdf");
    expect(state.pdfBytes).toEqual(newBytes);
    expect(state.basePdfBytes).toEqual(newBytes);
    expect(state.savedPdfBytes).toEqual(newBytes);
    expect(state.isDirty).toBe(false);
    expect(state.statusMessage).toBe("Saved");
    expect(state.currentPage).toBe(3);
  });

  it("clearDocument resets all document fields", () => {
    useDocumentStore.setState({
      documentId: "doc-1",
      filePath: "C:\\x.pdf",
      pdfDoc: {} as never,
      pdfBytes: new Uint8Array([1]),
      isDirty: true,
      documentPassword: "pw",
    });
    useDocumentStore.getState().clearDocument();
    const state = useDocumentStore.getState();
    expect(state.documentId).toBeNull();
    expect(state.pdfDoc).toBeNull();
    expect(state.pdfBytes).toBeNull();
    expect(state.isDirty).toBe(false);
    expect(state.documentPassword).toBeNull();
  });

  it("rotates pages and clamps zoom", () => {
    useDocumentStore.setState({ rotation: 0, zoom: 0.1 });
    useDocumentStore.getState().rotateClockwise();
    expect(useDocumentStore.getState().rotation).toBe(90);
    useDocumentStore.getState().rotateCounterClockwise();
    expect(useDocumentStore.getState().rotation).toBe(0);
    useDocumentStore.getState().setZoom(99);
    expect(useDocumentStore.getState().zoom).toBe(4);
  });
});
