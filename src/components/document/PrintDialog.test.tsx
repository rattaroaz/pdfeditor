import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDocumentStore } from "@/stores/documentStore";
import { useUiStore } from "@/stores/uiStore";

const mockPrint = vi.hoisted(() => vi.fn());

vi.mock("@/services/printService", () => ({
  printDocument: mockPrint,
}));

import { PrintDialog } from "./PrintDialog";

describe("PrintDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrint.mockResolvedValue(undefined);
    useUiStore.setState({ showPrintDialog: true });
    useDocumentStore.setState({
      pdfDoc: {} as never,
      currentPage: 2,
      metadata: { pageCount: 4, fileSize: 100 },
    });
  });

  it("prints the selected page range", async () => {
    render(<PrintDialog />);
    fireEvent.click(screen.getByTestId("print-range"));
    fireEvent.click(screen.getByTestId("print-confirm"));
    await waitFor(() =>
      expect(mockPrint).toHaveBeenCalledWith({ mode: "range", from: 1, to: 4 }),
    );
  });
});
