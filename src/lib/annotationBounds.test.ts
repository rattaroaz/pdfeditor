import { describe, expect, it } from "vitest";
import { annotationBounds, annotationCenter } from "./annotationBounds";
import type { TextAnnotation } from "@shared/types";

describe("annotationBounds", () => {
  it("returns text box dimensions", () => {
    const ann: TextAnnotation = {
      id: "1",
      type: "text",
      pageIndex: 0,
      createdAt: "",
      author: "u",
      color: "#000",
      x: 10,
      y: 20,
      width: 100,
      height: 24,
      content: "Hi",
      fontSize: 12,
    };
    expect(annotationBounds(ann)).toEqual({ x: 10, y: 20, width: 100, height: 24 });
    expect(annotationCenter(ann)).toEqual({ x: 60, y: 32 });
  });
});
