import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { log } from "@/lib/logging";
import { LogViewerPanel } from "./LogViewerPanel";

vi.mock("@/services/loggingService", () => ({
  fetchLoggingInfo: vi.fn().mockResolvedValue({ logDirectory: "C:\\logs\\pdfeditor" }),
  openLogDirectory: vi.fn(),
  readBackendLogTail: vi.fn().mockResolvedValue(["line one", "line two"]),
}));

describe("LogViewerPanel", () => {
  it("renders session logs and closes", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    log.app.info("Test log entry", { userAction: "test" });

    render(<LogViewerPanel onClose={onClose} />);
    expect(screen.getByTestId("log-viewer")).toBeInTheDocument();
    expect(screen.getByText(/Test log entry/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("switches to file tail tab", async () => {
    const user = userEvent.setup();
    render(<LogViewerPanel onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Log file/i }));
    expect(await screen.findByText("line one")).toBeInTheDocument();
  });
});
