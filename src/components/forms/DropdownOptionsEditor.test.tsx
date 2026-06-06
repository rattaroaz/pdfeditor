import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DropdownOptionsEditor } from "./DropdownOptionsEditor";

describe("DropdownOptionsEditor", () => {
  it("renders default options when list is empty", () => {
    render(<DropdownOptionsEditor options={[]} onChange={vi.fn()} />);
    expect(screen.getByTestId("dropdown-option-0")).toHaveValue("Option 1");
    expect(screen.getByTestId("dropdown-option-1")).toHaveValue("Option 2");
  });

  it("calls onChange when an option label is edited", () => {
    const onChange = vi.fn();
    render(<DropdownOptionsEditor options={["Red", "Green"]} onChange={onChange} />);

    fireEvent.change(screen.getByTestId("dropdown-option-0"), { target: { value: "Blue" } });
    expect(onChange).toHaveBeenCalledWith(["Blue", "Green"]);
  });

  it("calls onChange when option count changes", () => {
    const onChange = vi.fn();
    render(<DropdownOptionsEditor options={["A", "B"]} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Number of options"), { target: { value: "3" } });
    const lastCall = onChange.mock.calls.at(-1)?.[0] as string[];
    expect(lastCall).toHaveLength(3);
  });
});
