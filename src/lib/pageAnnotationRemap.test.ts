import { describe, expect, it } from "vitest";
import {
  remapAnnotationsAfterDelete,
  remapAnnotationsAfterInsert,
  remapAnnotationsAfterReorder,
  reorderPageNumbers,
} from "./pageAnnotationRemap";
import type { Annotation } from "@shared/types";

const note = (pageIndex: number, id: string): Annotation => ({
  id,
  type: "note",
  pageIndex,
  x: 0,
  y: 0,
  content: "test",
  createdAt: "2024-01-01",
  author: "User",
  color: "#fff",
});

describe("remapAnnotationsAfterDelete", () => {
  it("removes annotations on deleted pages and shifts indices", () => {
    const annotations = [note(0, "a"), note(1, "b"), note(2, "c")];
    const result = remapAnnotationsAfterDelete(annotations, [2]);
    expect(result).toEqual([note(0, "a"), note(1, "c")]);
  });
});

describe("remapAnnotationsAfterReorder", () => {
  it("updates page indices according to new order", () => {
    const annotations = [note(0, "a"), note(2, "c")];
    const result = remapAnnotationsAfterReorder(annotations, [3, 1, 2]);
    expect(result.find((a) => a.id === "a")?.pageIndex).toBe(1);
    expect(result.find((a) => a.id === "c")?.pageIndex).toBe(0);
  });
});

describe("remapAnnotationsAfterInsert", () => {
  it("shifts annotations at or after insert point", () => {
    const annotations = [note(0, "a"), note(1, "b"), note(2, "c")];
    const result = remapAnnotationsAfterInsert(annotations, 1, 1);
    expect(result.find((a) => a.id === "a")?.pageIndex).toBe(0);
    expect(result.find((a) => a.id === "b")?.pageIndex).toBe(2);
    expect(result.find((a) => a.id === "c")?.pageIndex).toBe(3);
  });
});

describe("reorderPageNumbers", () => {
  it("moves a page from one index to another", () => {
    expect(reorderPageNumbers(3, 0, 2)).toEqual([2, 3, 1]);
  });
});
