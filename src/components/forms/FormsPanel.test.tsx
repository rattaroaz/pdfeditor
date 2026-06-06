import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useDocumentStore } from "@/stores/documentStore";
import { useFormStore } from "@/stores/formStore";
import { FormsPanel } from "./FormsPanel";

vi.mock("@/lib/navigateToTarget", () => ({
  navigateToFormField: vi.fn(),
}));

describe("FormsPanel", () => {
  beforeEach(() => {
    useFormStore.getState().clearFormState();
    useDocumentStore.setState({ currentPage: 1, scrollToPage: null, isDirty: false });
  });

  it("shows XFA unsupported message", () => {
    useFormStore.setState({
      formInfo: { hasAcroform: false, hasXfa: true, fieldCount: 0 },
    });
    render(<FormsPanel />);
    expect(screen.getByText(/XFA forms/)).toBeInTheDocument();
  });

  it("shows empty state when no fields exist", () => {
    useFormStore.setState({
      formInfo: { hasAcroform: true, hasXfa: false, fieldCount: 0 },
    });
    render(<FormsPanel />);
    expect(screen.getByText(/No form fields/)).toBeInTheDocument();
  });

  it("lists existing PDF fields", async () => {
    const user = userEvent.setup();
    useFormStore.getState().setValuesFromPdf({
      CustomerName: { name: "CustomerName", value: "Jane Doe", type: "text" },
    });
    useFormStore.setState({
      formInfo: { hasAcroform: true, hasXfa: false, fieldCount: 1 },
    });

    render(<FormsPanel />);
    expect(screen.getByText("CustomerName")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /CustomerName/i }));
    expect(useFormStore.getState().activeFieldName).toBe("CustomerName");
  });

  it("shows new fields with dropdown option editor", () => {
    useFormStore.getState().addNewField({
      pageIndex: 0,
      name: "Color",
      kind: "dropdown",
      x: 10,
      y: 20,
      width: 120,
      height: 20,
      defaultValue: "Red",
      required: false,
      readOnly: false,
      options: ["Red", "Green"],
    });
    useFormStore.setState({
      formInfo: { hasAcroform: true, hasXfa: false, fieldCount: 0 },
    });

    render(<FormsPanel />);
    expect(screen.getByText("Color")).toBeInTheDocument();
    expect(screen.getByText(/New dropdown/)).toBeInTheDocument();
    expect(screen.getByTestId("dropdown-option-0")).toHaveValue("Red");
  });
});
