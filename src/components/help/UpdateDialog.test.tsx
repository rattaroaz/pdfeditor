import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { UpdateDialog } from "./UpdateDialog";
import { useUiStore } from "@/stores/uiStore";

describe("UpdateDialog", () => {
  beforeEach(() => {
    useUiStore.setState({
      showUpdateDialog: false,
      updatePhase: "idle",
      updateMessage: "",
    });
  });

  it("renders nothing when closed", () => {
    render(<UpdateDialog />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows checking title while busy", () => {
    useUiStore.setState({
      showUpdateDialog: true,
      updatePhase: "checking",
      updateMessage: "Checking GitHub for the latest build…",
    });
    render(<UpdateDialog />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Checking for updates")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  it("shows close button when up to date", () => {
    useUiStore.setState({
      showUpdateDialog: true,
      updatePhase: "up_to_date",
      updateMessage: "PDF Editor is up to date.",
    });
    render(<UpdateDialog />);
    expect(screen.getByText("Up to date")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("shows error title on failure", () => {
    useUiStore.setState({
      showUpdateDialog: true,
      updatePhase: "error",
      updateMessage: "Network error",
    });
    render(<UpdateDialog />);
    expect(screen.getByText("Update failed")).toBeInTheDocument();
    expect(screen.getByText("Network error")).toBeInTheDocument();
  });
});
