import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useUiStore } from "@/stores/uiStore";
import { ErrorDialog } from "./ErrorDialog";

describe("ErrorDialog", () => {
  beforeEach(() => {
    useUiStore.setState({
      showErrorDialog: false,
      lastError: null,
    });
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("renders nothing when no error is shown", () => {
    render(<ErrorDialog />);
    expect(screen.queryByTestId("error-dialog")).not.toBeInTheDocument();
  });

  it("shows error message and dismisses on button click", async () => {
    const user = userEvent.setup();
    useUiStore.setState({
      showErrorDialog: true,
      lastError: {
        message: "Save failed",
        errorId: "err-123",
        code: "IO_ERROR",
      },
    });

    render(<ErrorDialog />);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("Save failed")).toBeInTheDocument();
    expect(screen.getByTestId("error-id")).toHaveTextContent("err-123");
    expect(screen.getByTestId("error-id")).toHaveTextContent("IO_ERROR");

    await user.click(screen.getByTestId("error-dismiss"));
    expect(useUiStore.getState().showErrorDialog).toBe(false);
  });

  it("copies error id to clipboard", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    useUiStore.setState({
      showErrorDialog: true,
      lastError: { message: "Oops", errorId: "copy-me" },
    });

    render(<ErrorDialog />);
    await user.click(screen.getByRole("button", { name: "Copy ID" }));
    expect(writeText).toHaveBeenCalledWith("copy-me");
  });
});
