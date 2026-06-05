import { describe, expect, it } from "vitest";
import {
  computeTextEditBox,
  fontSizeFromBoxHeight,
  MAX_TEXT_FONT_SIZE,
  MIN_TEXT_FONT_SIZE,
} from "./textEditBox";

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

  it("grows height for multiple lines", () => {
    const one = computeTextEditBox("A", 12).height;
    const two = computeTextEditBox("A\nB", 12).height;
    expect(two).toBeGreaterThan(one);
  });

  it("derives font size from dragged box height", () => {
    expect(fontSizeFromBoxHeight(24)).toBe(24);
    expect(fontSizeFromBoxHeight(4)).toBe(MIN_TEXT_FONT_SIZE);
    expect(fontSizeFromBoxHeight(200)).toBe(MAX_TEXT_FONT_SIZE);
  });
});
