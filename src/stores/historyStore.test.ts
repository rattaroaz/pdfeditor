import { beforeEach, describe, expect, it } from "vitest";
import { useAnnotationStore } from "@/stores/annotationStore";
import { useContentEditStore } from "@/stores/contentEditStore";
import { useFormStore } from "@/stores/formStore";
import { clearHistory, useHistoryStore } from "@/stores/historyStore";

describe("historyStore", () => {
  beforeEach(() => {
    useAnnotationStore.getState().clearAnnotations();
    useContentEditStore.getState().clearEdits();
    useFormStore.getState().clearFormState();
    clearHistory();
  });

  it("undoes and redoes annotation changes", async () => {
    useAnnotationStore.getState().addAnnotation({
      type: "highlight",
      pageIndex: 0,
      rects: [{ x: 1, y: 2, width: 3, height: 4 }],
      author: "test",
      color: "#FFEB3B",
    });
    expect(useAnnotationStore.getState().annotations).toHaveLength(1);

    await useHistoryStore.getState().undo();
    expect(useAnnotationStore.getState().annotations).toHaveLength(0);

    await useHistoryStore.getState().redo();
    expect(useAnnotationStore.getState().annotations).toHaveLength(1);
  });

  it("undoes content and form edits together", async () => {
    useContentEditStore.getState().addTextEdit({
      pageIndex: 0,
      x: 10,
      y: 20,
      width: 100,
      height: 20,
      newText: "Hello",
      fontSize: 12,
      fontFamily: "Helvetica",
      color: "#000000",
      coverOld: false,
    });
    useFormStore.getState().addNewField({
      pageIndex: 0,
      name: "Field1",
      kind: "text",
      x: 5,
      y: 5,
      width: 80,
      height: 20,
    });

    await useHistoryStore.getState().undo();
    expect(useContentEditStore.getState().textEdits).toHaveLength(1);
    expect(useFormStore.getState().newFields).toHaveLength(0);

    await useHistoryStore.getState().undo();
    expect(useContentEditStore.getState().textEdits).toHaveLength(0);

    await useHistoryStore.getState().redo();
    expect(useContentEditStore.getState().textEdits).toHaveLength(1);
    expect(useFormStore.getState().newFields).toHaveLength(0);

    await useHistoryStore.getState().redo();
    expect(useFormStore.getState().newFields).toHaveLength(1);
  });
});
