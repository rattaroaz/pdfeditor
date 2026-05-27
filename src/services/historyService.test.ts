import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAnnotationStore } from "@/stores/annotationStore";
import { useDocumentStore } from "@/stores/documentStore";
import { useFormStore } from "@/stores/formStore";
import { useHistoryStore } from "@/stores/historyStore";

const { mockPersistAnnotations } = vi.hoisted(() => ({
  mockPersistAnnotations: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/documentService", () => ({
  persistAnnotations: mockPersistAnnotations,
}));

import { redoEdit, undoEdit } from "./historyService";

describe("historyService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useHistoryStore.getState().clear();
    useDocumentStore.setState({ isDirty: false });
    useAnnotationStore.setState({ annotations: [] });
    useFormStore.getState().clearFormState();
  });

  it("undo restores snapshot and marks document dirty", () => {
    useAnnotationStore.setState({
      annotations: [
        {
          id: "a1",
          type: "highlight",
          pageIndex: 0,
          createdAt: "2020-01-01T00:00:00.000Z",
          author: "test",
          color: "#ffff00",
          rects: [{ x: 0, y: 0, width: 10, height: 10 }],
        },
      ],
    });
    useHistoryStore.getState().record();
    useAnnotationStore.setState({ annotations: [] });

    undoEdit();

    expect(useAnnotationStore.getState().annotations).toHaveLength(1);
    expect(useDocumentStore.getState().isDirty).toBe(true);
    expect(mockPersistAnnotations).toHaveBeenCalled();
  });

  it("redo does nothing when future stack is empty", () => {
    redoEdit();
    expect(mockPersistAnnotations).not.toHaveBeenCalled();
  });
});
