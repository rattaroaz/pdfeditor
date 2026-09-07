import { afterEach, describe, expect, it, vi } from "vitest";
import { createScannedImageObjectUrl, scannedImageSrc } from "./scannedImageUrl";

describe("scannedImageUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds a data URL and an object URL for display", () => {
    const revoke = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:scan"),
      revokeObjectURL: revoke,
    });
    const image = { dataBase64: "AAAA", mimeType: "image/jpeg" };
    expect(scannedImageSrc(image)).toBe("data:image/jpeg;base64,AAAA");
    expect(createScannedImageObjectUrl(image)).toBe("blob:scan");
  });

  it("returns null for empty image data", () => {
    expect(createScannedImageObjectUrl({ dataBase64: "", mimeType: "image/jpeg" })).toBeNull();
  });
});
