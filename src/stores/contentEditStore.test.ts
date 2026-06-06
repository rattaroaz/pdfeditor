import { describe, expect, it, beforeEach } from "vitest";
import { useContentEditStore } from "./contentEditStore";

describe("contentEditStore", () => {
  beforeEach(() => {
    useContentEditStore.getState().clearEdits();
  });

  it("tracks text and image edits", () => {
    const store = useContentEditStore.getState();
    expect(store.hasEdits()).toBe(false);

    store.addTextEdit({
      pageIndex: 0,
      x: 10,
      y: 20,
      width: 100,
      height: 12,
      newText: "Hello",
      fontSize: 12,
      fontFamily: "Helvetica",
      color: "#000000",
      coverOld: false,
    });

    expect(useContentEditStore.getState().hasEdits()).toBe(true);
    expect(useContentEditStore.getState().textEdits).toHaveLength(1);
  });

  it("updates text edit content", () => {
    const id = useContentEditStore.getState().addTextEdit({
      pageIndex: 0,
      x: 10,
      y: 20,
      width: 100,
      height: 12,
      newText: "Hello",
      fontSize: 12,
      fontFamily: "Helvetica",
      color: "#000000",
      coverOld: false,
    });

    useContentEditStore.getState().updateTextEdit(id, { newText: "Updated" });
    expect(useContentEditStore.getState().textEdits[0]?.newText).toBe("Updated");
  });

  it("syncs live text without counting empty placeholders as edits", () => {
    const id = useContentEditStore.getState().addTextEdit({
      pageIndex: 0,
      x: 10,
      y: 20,
      width: 100,
      height: 12,
      newText: "",
      fontSize: 12,
      fontFamily: "Helvetica",
      color: "#000000",
      coverOld: false,
    });
    expect(useContentEditStore.getState().hasEdits()).toBe(false);

    useContentEditStore.getState().updateTextEditContent(id, "Draft");
    expect(useContentEditStore.getState().hasEdits()).toBe(true);
    expect(useContentEditStore.getState().textEdits[0]?.newText).toBe("Draft");
  });

  it("adds reflow warning when replacement text is much longer", () => {
    useContentEditStore.getState().addTextEdit({
      pageIndex: 0,
      x: 0,
      y: 0,
      width: 50,
      height: 12,
      oldText: "Hi",
      newText: "This is a much longer replacement string",
      fontSize: 12,
      fontFamily: "Helvetica",
      color: "#000000",
      coverOld: true,
    });

    expect(useContentEditStore.getState().reflowWarnings.length).toBeGreaterThan(0);
  });
});
