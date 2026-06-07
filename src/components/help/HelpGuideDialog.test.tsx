import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { HelpGuideDialog } from "./HelpGuideDialog";
import { useUiStore } from "@/stores/uiStore";

describe("HelpGuideDialog", () => {
  beforeEach(() => {
    useUiStore.setState({
      showHelpGuide: false,
      helpSectionId: "overview",
    });
  });

  it("renders nothing when closed", () => {
    render(<HelpGuideDialog />);
    expect(screen.queryByTestId("help-guide-dialog")).not.toBeInTheDocument();
  });

  it("shows guide sections when open", () => {
    useUiStore.setState({ showHelpGuide: true, helpSectionId: "overview" });
    render(<HelpGuideDialog />);
    expect(screen.getByTestId("help-guide-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("help-section-adding-text")).toBeInTheDocument();
    expect(screen.getByTestId("help-nav-adding-text")).toBeInTheDocument();
  });

  it("closes from the close button", () => {
    useUiStore.setState({ showHelpGuide: true });
    render(<HelpGuideDialog />);
    fireEvent.click(screen.getByTestId("help-guide-close"));
    expect(useUiStore.getState().showHelpGuide).toBe(false);
  });

  it("navigates to a section from the sidebar", () => {
    useUiStore.setState({ showHelpGuide: true, helpSectionId: "overview" });
    render(<HelpGuideDialog />);
    fireEvent.click(screen.getByTestId("help-nav-shortcuts"));
    expect(useUiStore.getState().helpSectionId).toBe("shortcuts");
  });
});
