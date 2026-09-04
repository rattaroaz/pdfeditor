import { describe, expect, it } from "vitest";
import {
  clampPageInches,
  cropScannedImage,
  defaultImportSize,
  presetSize,
  scalePageSize,
  withAspect,
} from "./importImageSize";

describe("importImageSize", () => {
  it("defaults imported photos to letter when paper is auto", () => {
    expect(defaultImportSize("auto")).toEqual({ widthIn: 8.5, heightIn: 11 });
    expect(defaultImportSize("a4").widthIn).toBeCloseTo(8.27);
  });

  it("applies paper and original-pixel presets", () => {
    expect(presetSize("letter", 100, 100, { x: 0, y: 0, width: 1, height: 1 })).toEqual({
      widthIn: 8.5,
      heightIn: 11,
    });
    const original = presetSize("original", 1500, 1500, { x: 0, y: 0, width: 1, height: 1 });
    expect(original).toEqual({ widthIn: 10, heightIn: 10 });
  });

  it("locks aspect when editing one side", () => {
    const sized = withAspect(10, 5, "width", 2);
    expect(sized.widthIn).toBe(10);
    expect(sized.heightIn).toBe(5);
  });

  it("scales and clamps page inches", () => {
    expect(scalePageSize(8, 10, 50)).toEqual({ widthIn: 4, heightIn: 5 });
    expect(clampPageInches(0, 99)).toEqual({ widthIn: 1, heightIn: 22 });
  });

  it("keeps a full-frame import without cropping", async () => {
    const image = { dataBase64: "abc", mimeType: "image/jpeg" };
    await expect(
      cropScannedImage(image, { x: 0, y: 0, width: 1, height: 1 }),
    ).resolves.toEqual(image);
  });
});
