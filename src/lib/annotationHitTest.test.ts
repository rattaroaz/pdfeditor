import { describe, expect, it } from "vitest";
import type { Annotation } from "@shared/types";
import { hitTestAnnotation, normalizeMarkupRect } from "./annotationHitTest";

describe("normalizeMarkupRect", () => {
  it("accepts a thin horizontal strikeout drag", () => {
    const rect = normalizeMarkupRect({ x: 10, y: 50 }, { x: 110, y: 51 }, "strikeout");
    expect(rect).toMatchObject({ x: 10, width: 100, height: 16 });
    expect(rect!.y).toBeCloseTo(42.5);
  });

  it("requires minimum area for highlights", () => {
    expect(normalizeMarkupRect({ x: 0, y: 0 }, { x: 2, y: 10 }, "highlight")).toBeNull();
  });
});

const base = {
  pageIndex: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  author: "User",
  color: "#000",
};

describe("hitTestAnnotation", () => {
  it("hits the topmost annotation", () => {
    const annotations: Annotation[] = [
      {
        ...base,
        id: "1",
        type: "highlight",
        rects: [{ x: 0, y: 0, width: 100, height: 20 }],
      },
      {
        ...base,
        id: "2",
        type: "note",
        x: 50,
        y: 10,
        content: "note",
      },
    ];
    expect(hitTestAnnotation(annotations, 0, 50, 10)?.id).toBe("2");
  });

  it("detects freehand strokes near the path", () => {
    const annotations: Annotation[] = [
      {
        ...base,
        id: "fh",
        type: "freehand",
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        strokeWidth: 2,
      },
    ];
    expect(hitTestAnnotation(annotations, 0, 50, 2)?.id).toBe("fh");
    expect(hitTestAnnotation(annotations, 0, 50, 50)).toBeNull();
  });

  it("detects shape bounds", () => {
    const annotations: Annotation[] = [
      {
        ...base,
        id: "shape",
        type: "shape",
        shape: "rectangle",
        x1: 10,
        y1: 10,
        x2: 60,
        y2: 40,
        strokeWidth: 2,
      },
    ];
    expect(hitTestAnnotation(annotations, 0, 30, 25)?.id).toBe("shape");
  });
});
