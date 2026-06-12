import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { APP_VERSION } from "@/lib/constants";

vi.mock("@/services/documentService", () => ({
  openPdfFromDialog: vi.fn(),
  savePdf: vi.fn(),
  revertToSaved: vi.fn(),
  closeDocument: vi.fn(),
}));
vi.mock("@/services/formService", () => ({
  applyFormChanges: vi.fn(),
  exportFormDataCsv: vi.fn(),
  exportFormDataFdfFile: vi.fn(),
  flattenForms: vi.fn(),
  importFormDataCsv: vi.fn(),
}));
vi.mock("@/services/assemblyService", () => ({
  mergeIntoCurrentDocument: vi.fn(),
  mergePdfFromDialog: vi.fn(),
}));
vi.mock("@/services/securityService", () => ({
  protectDocumentOnNextSave: vi.fn(),
  removeDocumentPasswordProtection: vi.fn(),
}));
vi.mock("@/services/updateService", () => ({
  checkForUpdatesAndApply: vi.fn(),
}));

import { checkForUpdatesAndApply } from "@/services/updateService";
import { MenuBar } from "./MenuBar";
import { useDocumentStore } from "@/stores/documentStore";
import { useUiStore } from "@/stores/uiStore";

describe("MenuBar", () => {
  beforeEach(() => {
    useDocumentStore.setState({
      pdfDoc: {} as never,
      showSidebar: true,
      viewMode: "single",
      presentationMode: false,
    });
    useUiStore.setState({ showSearch: false, showHelpGuide: false, helpSectionId: "overview" });
  });

  it("opens the user guide from the Help menu", () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId("menu-help"));
    fireEvent.click(screen.getByTestId("menu-help-guide"));
    expect(useUiStore.getState().showHelpGuide).toBe(true);
    expect(useUiStore.getState().helpSectionId).toBe("overview");
  });

  it("opens a specific help section from the Help menu", () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId("menu-help"));
    fireEvent.click(screen.getByText("Adding text: which tool?"));
    expect(useUiStore.getState().showHelpGuide).toBe(true);
    expect(useUiStore.getState().helpSectionId).toBe("adding-text");
  });

  it("toggles sidebar visibility from the View menu", () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId("menu-view"));
    fireEvent.click(screen.getByTestId("menu-toggle-sidebar"));
    expect(useDocumentStore.getState().showSidebar).toBe(false);

    fireEvent.click(screen.getByTestId("menu-view"));
    fireEvent.click(screen.getByTestId("menu-toggle-sidebar"));
    expect(useDocumentStore.getState().showSidebar).toBe(true);
  });

  it("changes view mode from the View menu", () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId("menu-view"));
    fireEvent.click(screen.getByText("Two-page spread"));
    expect(useDocumentStore.getState().viewMode).toBe("spread");
  });

  it("shows only Two-page spread in the View menu when no document is open", () => {
    useDocumentStore.setState({ pdfDoc: null, viewMode: "single" });
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId("menu-view"));
    expect(screen.getByText("Two-page spread")).toBeInTheDocument();
    expect(screen.queryByText("Single page")).not.toBeInTheDocument();
  });

  it("shows only Two-page spread in the View menu when in single-page mode", () => {
    useDocumentStore.setState({ viewMode: "single" });
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId("menu-view"));
    expect(screen.getByText("Two-page spread")).toBeInTheDocument();
    expect(screen.queryByText("Single page")).not.toBeInTheDocument();
  });

  it("shows only Single page in the View menu when in two-page spread mode", () => {
    useDocumentStore.setState({ viewMode: "spread" });
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId("menu-view"));
    expect(screen.getByText("Single page")).toBeInTheDocument();
    expect(screen.queryByText("Two-page spread")).not.toBeInTheDocument();
  });

  it("shows check for updates at the bottom of the Help menu", () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId("menu-help"));
    expect(screen.getByTestId("menu-check-updates")).toHaveTextContent("Check for updates");
    expect(screen.getByTestId("menu-help-version")).toHaveTextContent(`Version ${APP_VERSION}`);
  });

  it("starts update check from the Help menu", () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId("menu-help"));
    fireEvent.click(screen.getByTestId("menu-check-updates"));
    expect(checkForUpdatesAndApply).toHaveBeenCalled();
  });

  it("toggles search from the View menu", () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId("menu-view"));
    fireEvent.click(screen.getByTestId("menu-find"));
    expect(useUiStore.getState().showSearch).toBe(true);
  });

  it("toggles the logs panel from the View menu", () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId("menu-view"));
    fireEvent.click(screen.getByTestId("menu-log-panel"));
    expect(useUiStore.getState().showLogViewer).toBe(true);

    fireEvent.click(screen.getByTestId("menu-view"));
    fireEvent.click(screen.getByTestId("menu-log-panel"));
    expect(useUiStore.getState().showLogViewer).toBe(false);
  });
});
