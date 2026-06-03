import { beforeEach, describe, expect, it, vi } from "vitest";
import { open } from "@tauri-apps/plugin-dialog";
import { encodeBase64Pdf } from "@/lib/pdf/pdfBinary";
import { useDocumentStore } from "@/stores/documentStore";
import { parsePageRanges, buildSplitRanges, describeSplitParts } from "./assemblyService";

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const PDF_BASE64 = encodeBase64Pdf(PDF_BYTES);

const mockInvokeLogged = vi.hoisted(() => vi.fn());
const mockLoadPdf = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tauriInvoke", () => ({
  invokeLogged: mockInvokeLogged,
}));

vi.mock("@/lib/pdf/pdfEngine", () => ({
  encodeBase64Pdf: (bytes: Uint8Array) => encodeBase64Pdf(bytes),
  decodeBase64Pdf: () => PDF_BYTES.slice(),
  loadPdfFromBytes: mockLoadPdf,
  renderPageToCanvas: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  writeFile: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({
  dirname: vi.fn(async (p: string) => p.replace(/[/\\][^/\\]+$/, "") || "."),
  join: vi.fn(async (dir: string, file: string) => `${dir}/${file}`),
}));

vi.mock("@/lib/tauriRuntime", () => ({
  requireTauriDesktop: vi.fn(),
}));

import { mergeIntoCurrentDocument } from "./assemblyService";

const mockPdfDoc = { numPages: 4 };

describe("parsePageRanges", () => {
  it("parses single pages and ranges", () => {
    expect(parsePageRanges("1-2, 4", 10)).toEqual([
      [1, 2],
      [4],
    ]);
  });

  it("clamps to max page", () => {
    expect(parsePageRanges("8-12", 10)).toEqual([[8, 9, 10]]);
  });

  it("returns empty for invalid input", () => {
    expect(parsePageRanges("abc", 5)).toEqual([]);
  });
});

describe("buildSplitRanges", () => {
  it("splits in half", () => {
    expect(buildSplitRanges("half", 10)).toEqual([
      [1, 2, 3, 4, 5],
      [6, 7, 8, 9, 10],
    ]);
  });

  it("splits every n pages", () => {
    expect(buildSplitRanges("every-n", 10, { pagesPerFile: 3 })).toEqual([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
      [10],
    ]);
  });

  it("describes preview text", () => {
    const ranges = buildSplitRanges("half", 6);
    expect(describeSplitParts(ranges)).toContain("File 1: pages 1–3");
  });
});

describe("assemblyService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDocumentStore.setState({
      pdfBytes: PDF_BYTES,
      basePdfBytes: PDF_BYTES,
      fileName: "doc.pdf",
      isLoading: false,
    });
    mockLoadPdf.mockResolvedValue(mockPdfDoc);
    mockInvokeLogged.mockImplementation(async (cmd: string) => {
      if (cmd === "read_pdf_file") {
        return { dataBase64: PDF_BASE64, path: "/other.pdf" };
      }
      if (cmd === "merge_pdfs") {
        return { dataBase64: PDF_BASE64 };
      }
      throw new Error(`unexpected: ${cmd}`);
    });
  });

  it("mergeIntoCurrentDocument merges current bytes with selected files (array)", async () => {
    vi.mocked(open).mockResolvedValue(["/other.pdf"]);

    await mergeIntoCurrentDocument();

    expect(mockInvokeLogged).toHaveBeenCalledWith("merge_pdfs", {
      pdfBase64List: [PDF_BASE64, PDF_BASE64],
    });
    expect(useDocumentStore.getState().pdfDoc).toBe(mockPdfDoc);
  });

  it("mergeIntoCurrentDocument accepts a single selected path string", async () => {
    vi.mocked(open).mockResolvedValue("/other.pdf");

    await mergeIntoCurrentDocument();

    expect(mockInvokeLogged).toHaveBeenCalledWith("merge_pdfs", {
      pdfBase64List: [PDF_BASE64, PDF_BASE64],
    });
  });

  it("mergeIntoCurrentDocument shows error when no document open", async () => {
    useDocumentStore.setState({ pdfBytes: null, basePdfBytes: null });
    const { useUiStore } = await import("@/stores/uiStore");
    useUiStore.setState({ lastError: null, showErrorDialog: false });

    await mergeIntoCurrentDocument();

    expect(mockInvokeLogged).not.toHaveBeenCalledWith("merge_pdfs", expect.any(Object));
    expect(useUiStore.getState().lastError?.message).toMatch(/no document/i);
  });
});
