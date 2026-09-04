import { describe, expect, it } from "vitest";
import { getHelpSection, HELP_MENU_LINKS, HELP_SECTIONS } from "./helpGuide";

describe("helpGuide", () => {
  it("defines unique section ids", () => {
    const ids = HELP_SECTIONS.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes the adding-text comparison guide", () => {
    const section = getHelpSection("adding-text");
    expect(section?.title).toBe("Adding text: which tool?");
    expect(section?.blocks.some((block) => block.type === "comparison")).toBe(true);
  });

  it("links menu entries to existing sections", () => {
    for (const link of HELP_MENU_LINKS) {
      expect(getHelpSection(link.sectionId)).toBeDefined();
    }
  });

  it("documents scan and print", () => {
    const section = getHelpSection("scan-print");
    expect(section?.title).toBe("Scan & print");
    expect(HELP_MENU_LINKS.some((link) => link.sectionId === "scan-print")).toBe(true);
  });
});
