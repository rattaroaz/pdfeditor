import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./ThumbnailPanel", () => ({ ThumbnailPanelContent: () => null }));
vi.mock("./OutlinePanel", () => ({ OutlinePanel: () => null }));
vi.mock("./RecentFilesPanel", () => ({ RecentFilesPanel: () => null }));
vi.mock("./MetadataPanel", () => ({ MetadataPanel: () => null }));
vi.mock("./AnnotationsPanel", () => ({ AnnotationsPanel: () => null }));
vi.mock("@/components/forms/FormsPanel", () => ({ FormsPanel: () => null }));
vi.mock("@/components/document/DocumentPanel", () => ({ DocumentPanel: () => null }));

import { Sidebar } from "./Sidebar";
import { useDocumentStore } from "@/stores/documentStore";
import { SIDEBAR_WIDTH_DEFAULT } from "@/lib/constants";

describe("Sidebar", () => {
  beforeEach(() => {
    useDocumentStore.setState({
      showSidebar: true,
      sidebarWidth: SIDEBAR_WIDTH_DEFAULT,
      sidebarTab: "recent",
      pdfDoc: null,
    });
  });

  it("renders when showSidebar is true", () => {
    render(<Sidebar />);
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-resize-handle")).toBeInTheDocument();
  });

  it("collapses to zero width when hidden but stays mounted", () => {
    useDocumentStore.setState({ showSidebar: false });
    render(<Sidebar />);
    const sidebar = screen.getByTestId("sidebar");
    expect(sidebar).toHaveStyle({ width: "0px" });
    expect(screen.queryByTestId("sidebar-resize-handle")).not.toBeInTheDocument();
  });

  it("expands again when showSidebar becomes true", () => {
    useDocumentStore.setState({ showSidebar: false, sidebarWidth: SIDEBAR_WIDTH_DEFAULT });
    const { rerender } = render(<Sidebar />);
    expect(screen.getByTestId("sidebar")).toHaveStyle({ width: "0px" });

    act(() => {
      useDocumentStore.setState({ showSidebar: true });
    });
    rerender(<Sidebar />);
    expect(screen.getByTestId("sidebar")).toHaveStyle({ width: `${SIDEBAR_WIDTH_DEFAULT}px` });
    expect(screen.getByTestId("sidebar-resize-handle")).toBeInTheDocument();
  });
});
