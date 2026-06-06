import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAnnotationStore } from "@/stores/annotationStore";
import { ToolPalette } from "./ToolPalette";

describe("ToolPalette", () => {
  beforeEach(() => {
    useAnnotationStore.setState({ activeTool: "select", activeStamp: "approved" });
  });

  it("renders all markup tools", () => {
    render(<ToolPalette />);
    expect(screen.getByTestId("tool-select")).toBeInTheDocument();
    expect(screen.getByTestId("tool-highlight")).toBeInTheDocument();
    expect(screen.getByTestId("tool-stamp")).toBeInTheDocument();
  });

  it("selects a tool on click", async () => {
    const user = userEvent.setup();
    render(<ToolPalette />);
    await user.click(screen.getByTestId("tool-highlight"));
    expect(useAnnotationStore.getState().activeTool).toBe("highlight");
  });

  it("shows stamp choices when stamp tool is active", async () => {
    const user = userEvent.setup();
    render(<ToolPalette />);
    await user.click(screen.getByTestId("tool-stamp"));
    expect(screen.getByRole("button", { name: "Draft" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confidential" }));
    expect(useAnnotationStore.getState().activeStamp).toBe("confidential");
  });

  it("uses compact layout when embedded", () => {
    const { container } = render(<ToolPalette embedded />);
    const root = container.firstElementChild;
    expect(root?.className).not.toMatch(/border-b/);
  });
});
