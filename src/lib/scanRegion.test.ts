import { describe, expect, it } from "vitest";
import {
  clampScanRegion,
  describeScanInches,
  isFullScanRegion,
  officialPixelSize,
  regionFromDrag,
} from "./scanRegion";

describe("scanRegion", () => {
  it("clamps a region inside the preview", () => {
    expect(clampScanRegion({ x: -0.2, y: 0.9, width: 0.5, height: 0.5 })).toEqual({
      x: 0,
      y: 0.5,
      width: 0.5,
      height: 0.5,
    });
  });

  it("builds a region from a drag on the preview image", () => {
    const region = regionFromDrag(20, 10, 80, 70, 100, 100);
    expect(region.x).toBeCloseTo(0.2);
    expect(region.y).toBeCloseTo(0.1);
    expect(region.width).toBeCloseTo(0.6);
    expect(region.height).toBeCloseTo(0.6);
  });

  it("describes physical size from preview pixels", () => {
    const inches = describeScanInches({ x: 0, y: 0, width: 1, height: 1 }, 750, 1050, 75);
    expect(inches.widthIn).toBe(10);
    expect(inches.heightIn).toBe(14);
    expect(officialPixelSize({ x: 0, y: 0, width: 1, height: 1 }, 750, 1050, 75, 300)).toEqual({
      width: 3000,
      height: 4200,
    });
  });

  it("detects a full-bed selection", () => {
    expect(isFullScanRegion({ x: 0, y: 0, width: 1, height: 1 })).toBe(true);
    expect(isFullScanRegion({ x: 0.1, y: 0.1, width: 0.5, height: 0.5 })).toBe(false);
  });
});
