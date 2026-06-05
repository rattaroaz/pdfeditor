import { describe, expect, it } from "vitest";
import type { FreehandAnnotation, ShapeAnnotation, TextAnnotation } from "@shared/types";
import {
  canResizeAnnotation,
  hitTestResizeHandle,
  moveAnnotation,
  resizeAnnotation,
} from "@/lib/annotationTransform";
import { annotationBounds } from "@/lib/annotationBounds";

const base = {
  id: "1",
  pageIndex: 0,
  author: "User",
  createdAt: "",
};

describe("annotationTransform", () => {
  it("canResizeAnnotation excludes notes", () => {
    expect(canResizeAnnotation({ ...base, type: "note", x: 0, y: 0, content: "hi", color: "#000" })).toBe(false);
    expect(canResizeAnnotation({ ...base, type: "text", x: 0, y: 0, width: 50, height: 20, content: "hi", fontSize: 12, color: "#000" })).toBe(true);
  });

  it("moveAnnotation shifts text position", () => {
    const ann: TextAnnotation = {
      ...base,
      type: "text",
      x: 10,
      y: 20,
      width: 50,
      height: 20,
      content: "hello",
      fontSize: 12,
      color: "#000",
    };
    const moved = moveAnnotation(ann, 5, -3) as TextAnnotation;
    expect(moved.x).toBe(15);
    expect(moved.y).toBe(17);
  });

  it("resizeAnnotation updates text box size", () => {
    const ann: TextAnnotation = {
      ...base,
      type: "text",
      x: 10,
      y: 20,
      width: 50,
      height: 20,
      content: "hello",
      fontSize: 12,
      color: "#000",
    };
    const anchor = annotationBounds(ann);
    const resized = resizeAnnotation(ann, anchor, 80, 60) as TextAnnotation;
    expect(resized.width).toBe(70);
    expect(resized.height).toBe(40);
  });

  it("moveAnnotation shifts freehand points", () => {
    const ann: FreehandAnnotation = {
      ...base,
      type: "freehand",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
      strokeWidth: 2,
      color: "#000",
    };
    const moved = moveAnnotation(ann, 3, 4) as FreehandAnnotation;
    expect(moved.points[1]).toEqual({ x: 13, y: 14 });
  });

  it("resizeAnnotation scales freehand within anchor bounds", () => {
    const ann: FreehandAnnotation = {
      ...base,
      type: "freehand",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
      strokeWidth: 2,
      color: "#000",
    };
    const anchor = annotationBounds(ann);
    const resized = resizeAnnotation(ann, anchor, anchor.x + anchor.width * 2, anchor.y + anchor.height * 2);
    const bounds = annotationBounds(resized);
    expect(bounds.width).toBeGreaterThan(anchor.width);
    expect(bounds.height).toBeGreaterThan(anchor.height);
  });

  it("hitTestResizeHandle detects SE corner", () => {
    const ann: TextAnnotation = {
      ...base,
      type: "text",
      x: 10,
      y: 20,
      width: 50,
      height: 20,
      content: "hello",
      fontSize: 12,
      color: "#000",
    };
    expect(hitTestResizeHandle(ann, 60, 40, 1)).toBe(true);
    expect(hitTestResizeHandle(ann, 10, 20, 1)).toBe(false);
  });

  it("resizeAnnotation updates line endpoint", () => {
    const ann: ShapeAnnotation = {
      ...base,
      type: "shape",
      shape: "line",
      x1: 0,
      y1: 0,
      x2: 10,
      y2: 10,
      strokeWidth: 2,
      color: "#000",
    };
    const anchor = annotationBounds(ann);
    const resized = resizeAnnotation(ann, anchor, 30, 40) as ShapeAnnotation;
    expect(resized.x2).toBe(30);
    expect(resized.y2).toBe(40);
  });
});
