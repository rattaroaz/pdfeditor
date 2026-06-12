import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearHistory } from "@/stores/historyStore";
import { useDocumentStore } from "@/stores/documentStore";
import { useAnnotationStore } from "./annotationStore";

vi.mock("@/stores/historyStore", () => ({
  recordHistory: vi.fn(),
  clearHistory: vi.fn(),
}));

describe("annotationStore", () => {
  beforeEach(() => {
    clearHistory();
    useAnnotationStore.getState().clearAnnotations();
    useAnnotationStore.setState({ activeTool: "select", activeStamp: "approved" });
  });

  it("adds and removes annotations", () => {
    useAnnotationStore.getState().addAnnotation({
      type: "highlight",
      pageIndex: 0,
      author: "User",
      color: "#FFEB3B",
      rects: [{ x: 0, y: 0, width: 50, height: 20 }],
    });

    const list = useAnnotationStore.getState().annotations;
    expect(list).toHaveLength(1);
    const id = list[0]!.id;

    useAnnotationStore.getState().removeAnnotation(id);
    expect(useAnnotationStore.getState().annotations).toHaveLength(0);
    expect(useAnnotationStore.getState().selectedId).toBeNull();
  });

  it("clears selection when changing tools", () => {
    useAnnotationStore.getState().addAnnotation({
      type: "note",
      pageIndex: 0,
      author: "User",
      color: "#FFC107",
      x: 10,
      y: 10,
      content: "hi",
    });
    const id = useAnnotationStore.getState().annotations[0]!.id;
    useAnnotationStore.getState().selectAnnotation(id);
    useAnnotationStore.getState().setActiveTool("highlight");
    expect(useAnnotationStore.getState().selectedId).toBeNull();
    expect(useAnnotationStore.getState().activeTool).toBe("highlight");
  });

  it("marks the document dirty when annotations change", () => {
    useDocumentStore.setState({ isDirty: false });
    useAnnotationStore.getState().addAnnotation({
      type: "highlight",
      pageIndex: 0,
      author: "User",
      color: "#FFEB3B",
      rects: [{ x: 0, y: 0, width: 10, height: 10 }],
    });
    expect(useDocumentStore.getState().isDirty).toBe(true);

    useDocumentStore.setState({ isDirty: false });
    const id = useAnnotationStore.getState().annotations[0]!.id;
    useAnnotationStore.getState().updateAnnotation(id, { color: "#FF0000" });
    expect(useDocumentStore.getState().isDirty).toBe(true);

    useDocumentStore.setState({ isDirty: false });
    useAnnotationStore.getState().updateAnnotationLayout(id, {
      ...useAnnotationStore.getState().annotations[0]!,
      rects: [{ x: 1, y: 1, width: 20, height: 20 }],
    });
    expect(useDocumentStore.getState().isDirty).toBe(true);

    useDocumentStore.setState({ isDirty: false });
    useAnnotationStore.getState().removeAnnotation(id);
    expect(useDocumentStore.getState().isDirty).toBe(true);
  });

  it("filters page annotations", () => {
    useAnnotationStore.getState().addAnnotation({
      type: "highlight",
      pageIndex: 0,
      author: "User",
      color: "#FFEB3B",
      rects: [{ x: 0, y: 0, width: 10, height: 10 }],
    });
    useAnnotationStore.getState().addAnnotation({
      type: "highlight",
      pageIndex: 1,
      author: "User",
      color: "#FFEB3B",
      rects: [{ x: 0, y: 0, width: 10, height: 10 }],
    });
    expect(useAnnotationStore.getState().getPageAnnotations(0)).toHaveLength(1);
    expect(useAnnotationStore.getState().getPageAnnotations(1)).toHaveLength(1);
  });
});
