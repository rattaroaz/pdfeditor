import { describe, expect, it } from "vitest";
import { rotateViewportPoint, rotateViewportRect } from "./viewportCoords";

describe("viewportCoords", () => {
  const pageWidth = 100;
  const pageHeight = 200;

  it("rotates a point 90 degrees clockwise", () => {
    expect(rotateViewportPoint(10, 20, pageWidth, pageHeight, 90)).toEqual({
      x: 20,
      y: 90,
    });
  });

  it("rotates a rectangle 90 degrees clockwise", () => {
    const rect = rotateViewportRect(10, 20, 30, 40, pageWidth, pageHeight, 90);
    expect(rect.width).toBeCloseTo(40, 5);
    expect(rect.height).toBeCloseTo(30, 5);
  });

  it("returns to origin after four 90-degree rotations", () => {
    let point = { x: 12, y: 34 };
    for (let i = 0; i < 4; i++) {
      point = rotateViewportPoint(point.x, point.y, pageWidth, pageHeight, 90);
    }
    expect(point.x).toBeCloseTo(12, 5);
    expect(point.y).toBeCloseTo(34, 5);
  });
});
