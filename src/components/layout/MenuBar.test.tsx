import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("@/services/loggingService", () => ({
  openLogDirectory: vi.fn(),
}));
vi.mock("@/lib/logging", () => ({
  isLogViewerEnabled: () => false,
}));

import { MenuBar } from "./MenuBar";
import { useDocumentStore } from "@/stores/documentStore";
import { useUiStore } from "@/stores/uiStore";

describe("MenuBar", () => {
  beforeEach(() => {
    useDocumentStore.setState({
      pdfDoc: {} as never,
      showSidebar: true,
      viewMode: "continuous",
      presentationMode: false,
    });
    useUiStore.setState({ showSearch: false });
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
    fireEvent.click(screen.getByText("Single page"));
    expect(useDocumentStore.getState().viewMode).toBe("single");
  });

  it("toggles search from the View menu", () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId("menu-view"));
    fireEvent.click(screen.getByTestId("menu-find"));
    expect(useUiStore.getState().showSearch).toBe(true);
  });
});
