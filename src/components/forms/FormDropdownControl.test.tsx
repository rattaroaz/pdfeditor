import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { dropdownFieldTextStyle } from "@/lib/textEditBox";
import { FormDropdownControl } from "./FormDropdownControl";

const baseStyle = dropdownFieldTextStyle(20, 1);

describe("FormDropdownControl", () => {
  it("shows the selected value and toggles the option list", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onChange = vi.fn();

    render(
      <div style={{ position: "relative", width: 160, height: 20 }}>
        <FormDropdownControl
          controlKey="field-1"
          name="Color"
          value="Red"
          options={["Red", "Green", "Blue"]}
          textStyle={baseStyle}
          fieldHeight={20}
          scale={1}
          isOpen={false}
          onOpenChange={onOpenChange}
          onChange={onChange}
        />
      </div>,
    );

    expect(screen.getByRole("button", { name: "Color" })).toHaveTextContent("Red");
    await user.click(screen.getByRole("button", { name: "Color" }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("calls onChange when an option is picked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onChange = vi.fn();

    render(
      <div style={{ position: "relative", width: 160, height: 20 }}>
        <FormDropdownControl
          controlKey="field-1"
          name="Color"
          value="Red"
          options={["Red", "Green", "Blue"]}
          textStyle={baseStyle}
          fieldHeight={20}
          scale={1}
          isOpen
          onOpenChange={onOpenChange}
          onChange={onChange}
        />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Green" }));
    expect(onChange).toHaveBeenCalledWith("Green");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes when clicking outside", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <>
        <button type="button">Outside</button>
        <div style={{ position: "relative", width: 160, height: 20 }}>
          <FormDropdownControl
            controlKey="field-1"
            name="Color"
            value="Red"
            options={["Red", "Green"]}
            textStyle={baseStyle}
            fieldHeight={20}
            scale={1}
            isOpen
            onOpenChange={onOpenChange}
            onChange={vi.fn()}
          />
        </div>
      </>,
    );

    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
