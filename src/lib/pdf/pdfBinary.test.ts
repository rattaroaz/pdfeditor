import { describe, expect, it } from "vitest";
import {
  decodeBase64Pdf,
  encodeBase64Pdf,
  ensurePdfExtension,
  fileNameFromPath,
} from "./pdfBinary";

describe("pdfBinary", () => {
  it("round-trips PDF bytes through base64", () => {
    const original = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    const encoded = encodeBase64Pdf(original);
    const decoded = decodeBase64Pdf(encoded);
    expect(decoded).toEqual(original);
  });

  it("handles large payloads without stack overflow", () => {
    const large = new Uint8Array(100_000);
    large[0] = 0x25;
    const encoded = encodeBase64Pdf(large);
    expect(decodeBase64Pdf(encoded)).toEqual(large);
  });

  it("strips whitespace when decoding", () => {
    const bytes = new Uint8Array([0x25, 0x50]);
    const spaced = encodeBase64Pdf(bytes).replace(/(.{4})/g, "$1\n");
    expect(decodeBase64Pdf(spaced)).toEqual(bytes);
  });

  it("ensures pdf extension", () => {
    expect(ensurePdfExtension("doc")).toBe("doc.pdf");
    expect(ensurePdfExtension("doc.PDF")).toBe("doc.PDF");
  });

  it("extracts file name from path", () => {
    expect(fileNameFromPath("C:\\folder\\file.pdf")).toBe("file.pdf");
    expect(fileNameFromPath("/tmp/report.pdf")).toBe("report.pdf");
    expect(fileNameFromPath("")).toBe("document.pdf");
  });
});
