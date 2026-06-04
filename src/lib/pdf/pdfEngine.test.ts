import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDoc = { numPages: 2, getPage: vi.fn() };
const mockGetDocument = vi.hoisted(() =>
  vi.fn(() => ({
    promise: Promise.resolve(mockDoc),
  })),
);

vi.mock("pdfjs-dist", () => ({
  getDocument: mockGetDocument,
  GlobalWorkerOptions: { workerSrc: "/pdf.worker.min.mjs" },
  TextLayer: vi.fn(),
}));

import { ensurePdfExtension } from "./pdfBinary";
import {
  choiceOptionsFromPdfField,
  decodeBase64Pdf,
  encodeBase64Pdf,
  loadPdfFromBytes,
  PdfPasswordRequiredError,
} from "./pdfEngine";

describe("choiceOptionsFromPdfField", () => {
  it("reads pdf.js items array", () => {
    expect(
      choiceOptionsFromPdfField({
        items: [
          { exportValue: "Red", displayValue: "Red" },
          { exportValue: "Green", displayValue: "Green" },
        ],
      }),
    ).toEqual(["Red", "Green"]);
  });

  it("prefers explicit options when present", () => {
    expect(
      choiceOptionsFromPdfField({
        options: ["A", "B"],
        items: [{ exportValue: "X", displayValue: "X" }],
      }),
    ).toEqual(["A", "B"]);
  });

  it("returns undefined when no choices exist", () => {
    expect(choiceOptionsFromPdfField({})).toBeUndefined();
  });
});

describe("pdf binary codec", () => {
  it("round-trips PDF bytes through base64", () => {
    const original = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    const encoded = encodeBase64Pdf(original);
    const decoded = decodeBase64Pdf(encoded);
    expect(decoded).toEqual(original);
  });

  it("encodes large buffers without stack overflow", () => {
    const large = new Uint8Array(500_000);
    large[0] = 0x25;
    large[1] = 0x50;
    large[2] = 0x44;
    large[3] = 0x46;
    const encoded = encodeBase64Pdf(large);
    const decoded = decodeBase64Pdf(encoded);
    expect(decoded.length).toBe(large.length);
    expect(decoded[0]).toBe(0x25);
  });

  it("adds .pdf extension when missing", () => {
    expect(ensurePdfExtension("report")).toBe("report.pdf");
    expect(ensurePdfExtension("report.PDF")).toBe("report.PDF");
  });
});

describe("loadPdfFromBytes", () => {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDocument.mockImplementation(() => ({
      promise: Promise.resolve(mockDoc),
    }));
  });

  it("loads document via pdf.js", async () => {
    const doc = await loadPdfFromBytes(bytes);
    expect(doc.numPages).toBe(2);
    expect(mockGetDocument).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.any(Uint8Array), password: undefined }),
    );
  });

  it("passes password to pdf.js", async () => {
    await loadPdfFromBytes(bytes, "secret");
    expect(mockGetDocument).toHaveBeenCalledWith(
      expect.objectContaining({ password: "secret" }),
    );
  });

  it("throws PdfPasswordRequiredError when password needed", async () => {
    mockGetDocument.mockImplementation(() => ({
      promise: Promise.reject({ code: 1 }),
    }));
    await expect(loadPdfFromBytes(bytes)).rejects.toBeInstanceOf(PdfPasswordRequiredError);
  });

  it("marks incorrect password", async () => {
    mockGetDocument.mockImplementation(() => ({
      promise: Promise.reject({ code: 2 }),
    }));
    await expect(loadPdfFromBytes(bytes, "wrong")).rejects.toMatchObject({
      incorrect: true,
    });
  });
});
