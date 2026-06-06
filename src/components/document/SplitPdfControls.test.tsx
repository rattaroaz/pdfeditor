import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useDocumentStore } from "@/stores/documentStore";
import { SplitPdfControls, splitOptionsForMode } from "./SplitPdfControls";

const { mockSplitPdfWithOptions } = vi.hoisted(() => ({
  mockSplitPdfWithOptions: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/assemblyService", () => ({
  buildSplitRanges: vi.fn().mockReturnValue([
    [1, 4],
    [5, 8],
  ]),
  describeSplitParts: vi.fn().mockReturnValue("Part 1: pages 1-4 · Part 2: pages 5-8"),
  splitPdfWithOptions: mockSplitPdfWithOptions,
}));

describe("splitOptionsForMode", () => {
  it("maps split modes to option payloads", () => {
    expect(
      splitOptionsForMode("at-page", {
        splitAfterPage: 3,
        pagesPerFile: 5,
        customRanges: "1-2",
        currentPage: 2,
        pageCount: 10,
      }),
    ).toEqual({ splitAfterPage: 3 });

    expect(
      splitOptionsForMode("at-current", {
        splitAfterPage: 1,
        pagesPerFile: 5,
        customRanges: "",
        currentPage: 4,
        pageCount: 10,
      }),
    ).toEqual({ splitAfterPage: 4 });
  });
});

describe("SplitPdfControls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDocumentStore.setState({
      pdfDoc: { numPages: 8 } as never,
      metadata: { pageCount: 8, fileSize: 1000 },
      currentPage: 3,
      isLoading: false,
    });
  });

  it("prompts to open a document when none is loaded", () => {
    useDocumentStore.setState({ pdfDoc: null, metadata: null });
    render(<SplitPdfControls />);
    expect(screen.getByText(/Open a PDF to split/)).toBeInTheDocument();
  });

  it("blocks split for single-page documents", () => {
    useDocumentStore.setState({
      pdfDoc: { numPages: 1 } as never,
      metadata: { pageCount: 1, fileSize: 500 },
    });
    render(<SplitPdfControls />);
    expect(screen.getByText(/only one page/)).toBeInTheDocument();
  });

  it("shows split preview and invokes split", async () => {
    const user = userEvent.setup();
    render(<SplitPdfControls />);

    expect(screen.getByLabelText(/How to split/)).toBeInTheDocument();
    expect(screen.getByText(/Preview:/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Split PDF/i }));
    expect(mockSplitPdfWithOptions).toHaveBeenCalledWith("half", {});
  });

  it("shows page input for at-page mode", async () => {
    const user = userEvent.setup();
    render(<SplitPdfControls />);

    await user.selectOptions(screen.getByLabelText(/How to split/), "at-page");
    expect(screen.getByLabelText(/Last page in first file/)).toBeInTheDocument();
  });
});
