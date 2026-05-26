import { describe, expect, it } from "vitest";
import {
  decodeBase64Pdf,
  encodeBase64Pdf,
  ensurePdfExtension,
} from "./pdfBinary";

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
