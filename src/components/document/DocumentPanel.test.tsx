import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useDocumentStore } from "@/stores/documentStore";
import { DocumentPanel } from "./DocumentPanel";

const { mockMergePdfFromDialog, mockMergeIntoCurrentDocument } = vi.hoisted(() => ({
  mockMergePdfFromDialog: vi.fn().mockResolvedValue(undefined),
  mockMergeIntoCurrentDocument: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/assemblyService", () => ({
  mergePdfFromDialog: mockMergePdfFromDialog,
  mergeIntoCurrentDocument: mockMergeIntoCurrentDocument,
}));

describe("DocumentPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDocumentStore.setState({
      pdfDoc: null,
      isLoading: false,
      statusMessage: null,
    });
  });

  it("enables merge and disables append without an open document", () => {
    render(<DocumentPanel />);
    expect(screen.getByRole("button", { name: /Merge PDFs/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /Append to current/i })).toBeDisabled();
  });

  it("calls merge and append handlers", async () => {
    const user = userEvent.setup();
    useDocumentStore.setState({ pdfDoc: { numPages: 2 } as never });

    render(<DocumentPanel />);
    await user.click(screen.getByRole("button", { name: /Merge PDFs/i }));
    expect(mockMergePdfFromDialog).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Append to current/i }));
    expect(mockMergeIntoCurrentDocument).toHaveBeenCalled();
  });

  it("shows status message from document store", () => {
    useDocumentStore.setState({ statusMessage: "Merged 3 files" });
    render(<DocumentPanel />);
    expect(screen.getByText("Merged 3 files")).toBeInTheDocument();
  });
});
