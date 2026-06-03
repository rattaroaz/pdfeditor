import { describe, expect, it } from "vitest";
import { normalizeDialogPaths } from "./dialogPaths";

describe("normalizeDialogPaths", () => {
  it("returns empty for null", () => {
    expect(normalizeDialogPaths(null)).toEqual([]);
  });

  it("wraps a single path", () => {
    expect(normalizeDialogPaths("C:\\docs\\a.pdf")).toEqual(["C:\\docs\\a.pdf"]);
  });

  it("passes through arrays", () => {
    expect(normalizeDialogPaths(["a.pdf", "b.pdf"])).toEqual(["a.pdf", "b.pdf"]);
  });
});
