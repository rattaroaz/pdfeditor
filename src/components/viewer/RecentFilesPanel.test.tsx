import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecentFilesPanel } from "./RecentFilesPanel";

const { mockInvokeLogged, mockOpenPdfFromPath } = vi.hoisted(() => ({
  mockInvokeLogged: vi.fn(),
  mockOpenPdfFromPath: vi.fn(),
}));

vi.mock("@/lib/tauriInvoke", () => ({
  invokeLogged: mockInvokeLogged,
}));

vi.mock("@/services/documentService", () => ({
  openPdfFromPath: mockOpenPdfFromPath,
}));

describe("RecentFilesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvokeLogged.mockResolvedValue([
      { path: "C:\\docs\\a.pdf", name: "a.pdf", openedAt: "2026-01-01T00:00:00Z" },
      { path: "C:\\docs\\b.pdf", name: "b.pdf", openedAt: "2026-01-02T00:00:00Z" },
    ]);
  });

  it("loads and lists recent files", async () => {
    render(<RecentFilesPanel />);
    expect(screen.getByText(/Loading recent files/)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("a.pdf")).toBeInTheDocument();
    });
    expect(screen.getByText("b.pdf")).toBeInTheDocument();
    expect(mockInvokeLogged).toHaveBeenCalledWith("get_recent_files", {});
  });

  it("opens a file when clicked", async () => {
    const user = userEvent.setup();
    render(<RecentFilesPanel />);

    await waitFor(() => {
      expect(screen.getByText("a.pdf")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /a\.pdf/i }));
    expect(mockOpenPdfFromPath).toHaveBeenCalledWith("C:\\docs\\a.pdf");
  });

  it("shows empty state when invoke fails", async () => {
    mockInvokeLogged.mockRejectedValue(new Error("fail"));
    render(<RecentFilesPanel />);

    await waitFor(() => {
      expect(screen.getByText(/No recent files yet/)).toBeInTheDocument();
    });
  });
});
