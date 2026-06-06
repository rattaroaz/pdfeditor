import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useUiStore } from "@/stores/uiStore";
import { SplitPdfDialog } from "./SplitPdfDialog";

vi.mock("./SplitPdfControls", () => ({
  SplitPdfControls: () => <div data-testid="split-controls-stub" />,
}));

describe("SplitPdfDialog", () => {
  beforeEach(() => {
    useUiStore.setState({ showSplitDialog: false });
  });

  it("renders nothing when closed", () => {
    const { container } = render(<SplitPdfDialog />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows dialog and closes from cancel or backdrop", async () => {
    const user = userEvent.setup();
    useUiStore.setState({ showSplitDialog: true });

    const { container } = render(<SplitPdfDialog />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Split PDF")).toBeInTheDocument();
    expect(screen.getByTestId("split-controls-stub")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(useUiStore.getState().showSplitDialog).toBe(false);

    useUiStore.setState({ showSplitDialog: true });
    render(<SplitPdfDialog />);
    await user.click(container.querySelector(".fixed.inset-0")!);
    expect(useUiStore.getState().showSplitDialog).toBe(false);
  });
});
