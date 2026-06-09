import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_TOOLBAR_ORDER,
  findToolbarInsertBeforeId,
  loadToolbarOrder,
  normalizeToolbarOrder,
  reorderToolbarOrder,
  saveToolbarOrder,
} from "./toolbarOrder";

describe("toolbarOrder", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("normalizes partial saved order", () => {
    expect(normalizeToolbarOrder(["toolbar-zoom", "toolbar-modes"])).toEqual([
      "toolbar-zoom",
      "toolbar-modes",
      "toolbar-undo-redo",
      "toolbar-page-nav",
      "toolbar-sidebar",
      "toolbar-rotate",
    ]);
  });

  it("reorders toolbar items", () => {
    expect(
      reorderToolbarOrder(DEFAULT_TOOLBAR_ORDER, "toolbar-zoom", "toolbar-modes"),
    ).toEqual([
      "toolbar-zoom",
      "toolbar-modes",
      "toolbar-undo-redo",
      "toolbar-page-nav",
      "toolbar-sidebar",
      "toolbar-rotate",
    ]);
  });

  it("loads and saves toolbar order", () => {
    saveToolbarOrder(["toolbar-sidebar", "toolbar-modes"]);
    expect(loadToolbarOrder().slice(0, 2)).toEqual(["toolbar-sidebar", "toolbar-modes"]);
  });

  it("migrates legacy chrome layout toolbar order", () => {
    localStorage.setItem(
      "pdfeditor.chromeLayout",
      JSON.stringify({ toolbar: ["toolbar-zoom", "toolbar-rotate"] }),
    );
    expect(loadToolbarOrder().slice(0, 2)).toEqual(["toolbar-zoom", "toolbar-rotate"]);
  });

  it("finds insert position from pointer x", () => {
    const container = document.createElement("div");
    const makeItem = (id: string, left: number, width: number) => {
      const el = document.createElement("div");
      el.setAttribute("data-toolbar-id", id);
      el.getBoundingClientRect = () =>
        ({
          left,
          width,
          right: left + width,
          top: 0,
          bottom: 0,
          height: 0,
          x: left,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect;
      container.appendChild(el);
    };

    makeItem("toolbar-modes", 0, 100);
    makeItem("toolbar-sidebar", 110, 80);

    expect(
      findToolbarInsertBeforeId(40, ["toolbar-modes", "toolbar-sidebar"], container),
    ).toBe("toolbar-modes");
    expect(
      findToolbarInsertBeforeId(140, ["toolbar-modes", "toolbar-sidebar"], container),
    ).toBe("toolbar-sidebar");
    expect(
      findToolbarInsertBeforeId(300, ["toolbar-modes", "toolbar-sidebar"], container),
    ).toBeNull();
  });
});
