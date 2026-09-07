import { describe, expect, it } from "vitest";
import { preferFeederDevice, scannerLooksLikeFeeder, scannerNameStem } from "./scanFeeder";

describe("scanFeeder", () => {
  it("detects ADF names and strips the feeder suffix", () => {
    expect(scannerLooksLikeFeeder("Epson WF-2860 Series ADF")).toBe(true);
    expect(scannerLooksLikeFeeder("Epson WF-2860 Series")).toBe(false);
    expect(scannerNameStem("Epson WF-2860 Series ADF")).toBe("Epson WF-2860 Series");
  });

  it("prefers a sibling ADF device for the selected Epson scanner", () => {
    expect(
      preferFeederDevice(
        [
          { id: "flat", name: "Epson WF-2860 Series" },
          { id: "adf", name: "Epson WF-2860 Series ADF" },
        ],
        "flat",
      ),
    ).toBe("adf");
  });

  it("uses the Epson RR-600W when Scan feeder is run with a Brother MFP selected", () => {
    expect(scannerLooksLikeFeeder("EPSOND686BA (RR-600W)")).toBe(true);
    expect(
      preferFeederDevice(
        [
          { id: "brother", name: "Brother MFC-9340CDW [30055c6b12e3]" },
          { id: "brother-lan", name: "Brother MFC-9340CDW LAN" },
          { id: "epson", name: "EPSOND686BA (RR-600W)" },
        ],
        "brother",
      ),
    ).toBe("epson");
  });

  it("keeps an already-selected feeder device", () => {
    expect(
      preferFeederDevice(
        [
          { id: "flat", name: "Epson WF-2860 Series" },
          { id: "adf", name: "Epson WF-2860 Series ADF" },
        ],
        "adf",
      ),
    ).toBe("adf");
  });
});
