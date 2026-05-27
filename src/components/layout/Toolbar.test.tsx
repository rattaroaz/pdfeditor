import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useDocumentStore } from "@/stores/documentStore";
import { useHistoryStore } from "@/stores/historyStore";

const { mockOpen, mockSave, mockUndo, mockRedo } = vi.hoisted(() => ({
  mockOpen: vi.fn(),
  mockSave: vi.fn(),
  mockUndo: vi.fn(),
  mockRedo: vi.fn(),
}));

vi.mock("@/services/documentService", () => ({
  openPdfFromDialog: mockOpen,
  savePdf: mockSave,
}));

vi.mock("@/services/historyService", () => ({
  undoEdit: mockUndo,
  redoEdit: mockRedo,
}));

import { Toolbar } from "./Toolbar";

describe("Toolbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useHistoryStore.getState().clear();
    useDocumentStore.setState({
      pdfDoc: null,
      metadata: null,
      currentPage: 1,
      zoom: 1,
    });
  });

  it("disables save and undo when no document is open", () => {
    render(<Toolbar />);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  });

  it("enables undo when history has past entries", () => {
    useDocumentStore.setState({
      pdfDoc: { numPages: 1 } as never,
      metadata: { pageCount: 1, fileSize: 100 },
    });
    useHistoryStore.getState().record();

    render(<Toolbar />);
    expect(screen.getByRole("button", { name: "Undo" })).not.toBeDisabled();
  });

  it("calls open and save handlers", async () => {
    const user = userEvent.setup();
    useDocumentStore.setState({
      pdfDoc: { numPages: 1 } as never,
      metadata: { pageCount: 1, fileSize: 100 },
      filePath: "/doc.pdf",
      pdfBytes: new Uint8Array(4),
    });

    render(<Toolbar />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(mockOpen).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(mockSave).toHaveBeenCalledWith(false);
  });
});
