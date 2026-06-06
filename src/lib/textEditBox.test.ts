import { describe, expect, it } from "vitest";
import {
  computeTextEditBox,
  coverLayoutMinimums,
  descenderPadding,
  dropdownBoxHeightFromFontSize,
  dropdownDescenderPadding,
  dropdownFieldTextStyle,
  dropdownFontSizeFromBoxHeight,
  dropdownTextContentStyle,
  fontSizeFromBoxHeight,
  boxHeightFromFontSize,
  layoutCoverTextEdit,
  layoutDropdownFromDrag,
  MAX_TEXT_FONT_SIZE,
  MIN_TEXT_FONT_SIZE,
} from "./textEditBox";

describe("textEditBox", () => {
  it("computes tight height from font size", () => {
    const box = computeTextEditBox("Hi", 12);
    expect(box.height).toBe(19);
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
    expect(fontSizeFromBoxHeight(24)).toBe(17);
    expect(fontSizeFromBoxHeight(16)).toBe(9);
    expect(fontSizeFromBoxHeight(60)).toBe(45);
    expect(fontSizeFromBoxHeight(4)).toBe(MIN_TEXT_FONT_SIZE);
    expect(fontSizeFromBoxHeight(200)).toBe(MAX_TEXT_FONT_SIZE);
  });

  it("allocates proportional descender padding", () => {
    expect(descenderPadding(12)).toBe(5);
    expect(descenderPadding(40)).toBe(12);
  });

  it("uses tight dropdown box layout", () => {
    expect(dropdownDescenderPadding(12)).toBe(6);
    expect(dropdownBoxHeightFromFontSize(12)).toBe(20);
    expect(dropdownFontSizeFromBoxHeight(20)).toBe(12);
    expect(layoutDropdownFromDrag(24)).toEqual({ fontSize: 15, height: 24 });
  });

  it("keeps dropdown font and height in sync across sizes", () => {
    for (const fontSize of [6, 12, 24, 48]) {
      const height = dropdownBoxHeightFromFontSize(fontSize);
      expect(dropdownFontSizeFromBoxHeight(height)).toBe(fontSize);
      expect(layoutDropdownFromDrag(height)).toEqual({ fontSize, height });
    }
  });

  it("uses less total height than text fields for small fonts", () => {
    expect(dropdownBoxHeightFromFontSize(6)).toBeLessThan(boxHeightFromFontSize(6));
  });

  it("styles dropdown text without scrollbars", () => {
    const style = dropdownTextContentStyle(12, 2);
    expect(style.overflow).toBe("hidden");
    expect(style.paddingBottom).toBe(dropdownDescenderPadding(12) * 2);
    expect(style.lineHeight).toBe("24px");
  });

  it("builds dropdown field style from box height", () => {
    const style = dropdownFieldTextStyle(20, 1);
    expect(style.fontSize).toBe(12);
    expect(style.paddingRight).toBe(18);
    expect(style.overflow).toBe("hidden");
  });

  it("keeps full cover width when replacement text is shorter", () => {
    const hit = { x: 100, y: 50, width: 120, height: 14 };
    const original = layoutCoverTextEdit("Long original wording", 12, hit);
    const shorter = layoutCoverTextEdit("Hi", 12, hit);
    const mins = coverLayoutMinimums(
      {
        coverOld: true,
        coverWidth: original.width,
        coverHeight: original.height,
        oldText: "Long original wording",
        fontSize: 12,
      },
      "Hi",
    );
    const box = computeTextEditBox("Hi", 12, { coverOld: true, ...mins });

    expect(box.width).toBeGreaterThanOrEqual(original.width);
    expect(box.width).toBe(original.width);
    expect(shorter.width).toBeLessThan(original.width);
  });

  it("expands cover width when replacement text is longer", () => {
    const hit = { x: 10, y: 20, width: 40, height: 12 };
    const longer = layoutCoverTextEdit("Much longer replacement copy", 12, hit);
    expect(longer.width).toBeGreaterThan(
      layoutCoverTextEdit("Short", 12, hit).width,
    );
  });
});
