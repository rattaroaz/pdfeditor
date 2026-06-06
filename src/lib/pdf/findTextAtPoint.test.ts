import { describe, expect, it, vi } from "vitest";

const mockTransform = vi.hoisted(() =>
  vi.fn((_viewportTransform: number[], itemTransform: number[]) => {
    const [a, b, c, d, e, f] = itemTransform;
    return [a, b, c, d, e, f];
  }),
);

vi.mock("pdfjs-dist", () => ({
  Util: { transform: mockTransform },
  GlobalWorkerOptions: { workerSrc: "/pdf.worker.min.mjs" },
  TextLayer: vi.fn(),
  getDocument: vi.fn(),
}));

import { findTextAtPoint, textItemViewportRect } from "./pdfEngine";

describe("textItemViewportRect", () => {
  const viewport = {
    transform: [1, 0, 0, -1, 0, 792] as number[],
  } as ReturnType<import("pdfjs-dist").PDFPageProxy["getViewport"]>;

  it("maps pdf.js transform to top-left viewport rect", () => {
    const rect = textItemViewportRect(
      {
        str: "Hello",
        transform: [12, 0, 0, 12, 100, 700],
        width: 48,
        height: 12,
        dir: "ltr",
        fontName: "Helvetica",
        hasEOL: false,
      },
      viewport,
    );

    expect(rect).toEqual({
      text: "Hello",
      x: 100,
      y: 688,
      width: 48,
      height: 12,
      fontSize: 12,
      baselineY: 700,
    });
  });
});

describe("findTextAtPoint", () => {
  const viewport = {
    transform: [1, 0, 0, -1, 0, 792] as number[],
  } as ReturnType<import("pdfjs-dist").PDFPageProxy["getViewport"]>;

  it("returns merged line text when click hits a glyph", async () => {
    const page = {
      getTextContent: vi.fn().mockResolvedValue({
        items: [
          { str: "Hel", transform: [12, 0, 0, 12, 100, 700], width: 24, height: 12 },
          { str: "lo", transform: [12, 0, 0, 12, 124, 700], width: 16, height: 12 },
        ],
      }),
      getViewport: vi.fn().mockReturnValue(viewport),
    };

    const hit = await findTextAtPoint(page as never, 110, 694);
    expect(hit?.text).toBe("Hello");
    expect(hit?.x).toBe(100);
    expect(hit?.width).toBe(40);
  });

  it("finds nearest text within tolerance", async () => {
    const page = {
      getTextContent: vi.fn().mockResolvedValue({
        items: [
          { str: "Hi", transform: [12, 0, 0, 12, 50, 700], width: 20, height: 12 },
        ],
      }),
      getViewport: vi.fn().mockReturnValue(viewport),
    };

    const hit = await findTextAtPoint(page as never, 48, 700);
    expect(hit?.text).toBe("Hi");
  });

  it("returns null when no text is near the click", async () => {
    const page = {
      getTextContent: vi.fn().mockResolvedValue({
        items: [
          { str: "Hi", transform: [12, 0, 0, 12, 50, 700], width: 20, height: 12 },
        ],
      }),
      getViewport: vi.fn().mockReturnValue(viewport),
    };

    const hit = await findTextAtPoint(page as never, 400, 400);
    expect(hit).toBeNull();
  });

  it("returns only the clicked word, not the entire line", async () => {
    const page = {
      getTextContent: vi.fn().mockResolvedValue({
        items: [
          { str: "Hello", transform: [12, 0, 0, 12, 100, 700], width: 40, height: 12 },
          { str: "world", transform: [12, 0, 0, 12, 200, 700], width: 36, height: 12 },
        ],
      }),
      getViewport: vi.fn().mockReturnValue(viewport),
    };

    const hit = await findTextAtPoint(page as never, 210, 694);
    expect(hit?.text).toBe("world");
    expect(hit?.x).toBe(200);
    expect(hit?.width).toBe(36);
  });
});
