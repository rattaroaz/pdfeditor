import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useDocumentStore } from "@/stores/documentStore";
import { OutlinePanel } from "./OutlinePanel";

const { mockGetDocumentOutline } = vi.hoisted(() => ({
  mockGetDocumentOutline: vi.fn(),
}));

vi.mock("@/lib/pdf/pdfEngine", () => ({
  getDocumentOutline: mockGetDocumentOutline,
}));

describe("OutlinePanel", () => {
  beforeEach(() => {
    useDocumentStore.setState({
      pdfDoc: { numPages: 5 } as never,
      currentPage: 1,
      scrollToPage: null,
      metadata: { pageCount: 5, fileSize: 1000 },
    });
    mockGetDocumentOutline.mockResolvedValue([
      {
        title: "Chapter 1",
        pageIndex: 0,
        level: 0,
        children: [{ title: "Section A", pageIndex: 2, level: 1, children: [] }],
      },
    ]);
  });

  it("shows loading then outline entries", async () => {
    render(<OutlinePanel />);
    expect(screen.getByText(/Loading outline/)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Chapter 1" })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Section A" })).toBeInTheDocument();
  });

  it("navigates when an outline item is clicked", async () => {
    const user = userEvent.setup();
    render(<OutlinePanel />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Section A" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Section A" }));
    await waitFor(() => {
      expect(useDocumentStore.getState().currentPage).toBe(3);
    });
    expect(useDocumentStore.getState().scrollToPage).toBe(3);
  });

  it("shows empty state when outline is missing", async () => {
    mockGetDocumentOutline.mockResolvedValue([]);
    render(<OutlinePanel />);

    await waitFor(() => {
      expect(screen.getByText(/No bookmarks/)).toBeInTheDocument();
    });
  });
});
