import { describe, expect, it } from "vitest";
import {
  queueScanPages,
  removeQueuedPage,
  selectedScanImages,
  setAllPagesSelected,
  setPageSelected,
} from "./scanQueue";

const images = [
  { dataBase64: "aaa", mimeType: "image/jpeg" },
  { dataBase64: "bbb", mimeType: "image/jpeg" },
];

describe("scanQueue", () => {
  it("queues scanned pages as selected by default", () => {
    const pages = queueScanPages(images);
    expect(pages).toHaveLength(2);
    expect(pages.every((page) => page.selected)).toBe(true);
    expect(new Set(pages.map((page) => page.id)).size).toBe(2);
    expect(selectedScanImages(pages)).toEqual(images);
  });

  it("toggles and removes pages", () => {
    const [first, second] = queueScanPages(images);
    const deselected = setPageSelected([first, second], first.id, false);
    expect(selectedScanImages(deselected)).toEqual([second.image]);
    expect(selectedScanImages(setAllPagesSelected(deselected, true))).toHaveLength(2);
    expect(removeQueuedPage(deselected, second.id)).toEqual([
      { ...first, selected: false },
    ]);
  });
});
