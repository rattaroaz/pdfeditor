import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useDocumentStore } from "@/stores/documentStore";
import { useHistoryStore } from "@/stores/historyStore";
import { useUiStore } from "@/stores/uiStore";

const { mockUndo, mockRedo } = vi.hoisted(() => ({
  mockUndo: vi.fn(),
  mockRedo: vi.fn(),
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
    useUiStore.setState({ appMode: "markup" });
    useDocumentStore.setState({
      pdfDoc: null,
      metadata: null,
      currentPage: 1,
      zoom: 1,
    });
  });

  it("does not show open or save buttons", () => {
    render(<Toolbar />);
    expect(screen.queryByRole("button", { name: "Open" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("disables undo when no document is open", () => {
    render(<Toolbar />);
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

  it("calls undo handler", async () => {
    const user = userEvent.setup();
    useDocumentStore.setState({
      pdfDoc: { numPages: 1 } as never,
      metadata: { pageCount: 1, fileSize: 100 },
    });
    useHistoryStore.getState().record();

    render(<Toolbar />);
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(mockUndo).toHaveBeenCalled();
  });

  it("calls redo when redo is available", async () => {
    const user = userEvent.setup();
    useDocumentStore.setState({
      pdfDoc: { numPages: 1 } as never,
      metadata: { pageCount: 1, fileSize: 100 },
    });
    useHistoryStore.getState().record();
    useHistoryStore.getState().record();
    useHistoryStore.getState().undo();

    render(<Toolbar />);
    await user.click(screen.getByRole("button", { name: "Redo" }));
    expect(mockRedo).toHaveBeenCalled();
  });

  it("shows markup tools below the main row in markup mode", () => {
    render(<Toolbar />);
    expect(screen.getByTestId("toolbar-mode-tools")).toBeInTheDocument();
    expect(screen.getByTestId("tool-select")).toBeInTheDocument();
  });

  it("shows edit tools below the main row when edit mode is selected", async () => {
    const user = userEvent.setup();
    render(<Toolbar />);
    await user.click(screen.getByTestId("toolbar-mode-edit"));
    expect(useUiStore.getState().appMode).toBe("edit");
    expect(screen.getByTestId("tool-add-text-block")).toBeInTheDocument();
    expect(screen.queryByTestId("tool-highlight")).not.toBeInTheDocument();
  });

  it("hides mode tools row in document mode", async () => {
    const user = userEvent.setup();
    render(<Toolbar />);
    await user.click(screen.getByTestId("toolbar-mode-document"));
    expect(screen.queryByTestId("toolbar-mode-tools")).not.toBeInTheDocument();
  });
});
