import { describe, expect, it } from "vitest";
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
});
