import { describe, expect, it, vi } from "vitest";

vi.mock("pdfjs-dist", () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: "" },
  TextLayer: vi.fn(),
}));

import { resolvePrintPages } from "./printService";

describe("resolvePrintPages", () => {
  it("returns every page for all", () => {
    expect(resolvePrintPages({ mode: "all" }, 3, 2)).toEqual([1, 2, 3]);
  });

  it("returns the current page", () => {
    expect(resolvePrintPages({ mode: "current" }, 5, 4)).toEqual([4]);
  });

  it("clamps a custom range", () => {
    expect(resolvePrintPages({ mode: "range", from: 0, to: 99 }, 4, 1)).toEqual([1, 2, 3, 4]);
    expect(resolvePrintPages({ mode: "range", from: 2, to: 3 }, 5, 1)).toEqual([2, 3]);
  });

  it("returns empty when there are no pages", () => {
    expect(resolvePrintPages({ mode: "all" }, 0, 1)).toEqual([]);
  });
});
