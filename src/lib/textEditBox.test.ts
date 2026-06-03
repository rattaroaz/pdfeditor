import { describe, expect, it } from "vitest";
import { computeTextEditBox, measureTextWidth } from "./textEditBox";

describe("textEditBox", () => {
  it("computes tight height from font size", () => {
    const box = computeTextEditBox("Hi", 12);
    expect(box.height).toBe(12);
  });

  it("expands width with text length", () => {
    const short = computeTextEditBox("A", 12).width;
    const long = computeTextEditBox("ABCDEFGH", 12).width;
    expect(long).toBeGreaterThan(short);
  });

  it("respects minWidth when covering old text", () => {
    const box = computeTextEditBox("A", 12, { coverOld: true, minWidth: 80 });
    expect(box.width).toBeGreaterThanOrEqual(80);
  });

  it("measureTextWidth returns positive for non-empty text", () => {
    expect(measureTextWidth("Hello", 12)).toBeGreaterThan(0);
  });
});
