import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DropdownOptionsDialog } from "./DropdownOptionsDialog";

describe("DropdownOptionsDialog", () => {
  it("shows field name and confirms normalized options", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <DropdownOptionsDialog
        fieldName="Color"
        initialOptions={["Red", "Green"]}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByTestId("dropdown-options-dialog")).toBeInTheDocument();
    expect(screen.getByText("Color")).toBeInTheDocument();

    await user.click(screen.getByTestId("dropdown-options-confirm"));
    expect(onConfirm).toHaveBeenCalledWith(["Red", "Green"]);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("cancels from button and backdrop click", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <DropdownOptionsDialog
        fieldName="Size"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    onCancel.mockClear();
    const { container } = render(
      <DropdownOptionsDialog fieldName="Size" onConfirm={vi.fn()} onCancel={onCancel} />,
    );
    await user.click(container.querySelector(".fixed.inset-0")!);
    expect(onCancel).toHaveBeenCalled();
  });
});
