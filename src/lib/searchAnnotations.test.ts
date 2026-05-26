import { describe, expect, it } from "vitest";
import { searchAnnotations } from "./searchAnnotations";
import type { Annotation } from "@shared/types";

const sample: Annotation[] = [
  {
    id: "1",
    type: "note",
    pageIndex: 0,
    createdAt: "2026-01-01",
    author: "User",
    color: "#FFC107",
    x: 10,
    y: 10,
    content: "Review contract terms",
  },
  {
    id: "2",
    type: "highlight",
    pageIndex: 1,
    createdAt: "2026-01-01",
    author: "User",
    color: "#FFEB3B",
    rects: [{ x: 0, y: 0, width: 10, height: 10 }],
  },
];

describe("searchAnnotations", () => {
  it("finds text in note annotations", () => {
    const matches = searchAnnotations(sample, "contract");
    expect(matches).toHaveLength(1);
    expect(matches[0].source).toBe("annotation");
    expect(matches[0].annotationId).toBe("1");
  });

  it("returns empty for no query", () => {
    expect(searchAnnotations(sample, "")).toEqual([]);
  });
});
