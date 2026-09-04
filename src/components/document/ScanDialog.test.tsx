import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUiStore } from "@/stores/uiStore";

const mockList = vi.hoisted(() => vi.fn());
const mockAcquire = vi.hoisted(() => vi.fn());
const mockImport = vi.hoisted(() => vi.fn());
const mockCreate = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());

vi.mock("@/services/scanService", () => ({
  listScanners: mockList,
  acquireScanPages: mockAcquire,
  importImageFiles: mockImport,
  createPdfFromImages: mockCreate,
  insertScannedImages: mockInsert,
}));

import { ScanDialog } from "./ScanDialog";

const pageA = { dataBase64: "pageA", mimeType: "image/jpeg" };
const pageB = { dataBase64: "pageB", mimeType: "image/jpeg" };

describe("ScanDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue({ scanners: [{ id: "s1", name: "Desk scanner" }], backend: "wia" });
    mockAcquire
      .mockResolvedValueOnce([{ dataBase64: "preview", mimeType: "image/jpeg" }])
      .mockResolvedValueOnce([pageA, pageB]);
    mockCreate.mockResolvedValue(true);
    useUiStore.setState({ showScanDialog: true, scanDialogMode: "new" });
  });

  it("lets the user select scanned pages before creating a PDF", async () => {
    render(<ScanDialog />);
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId("scan-preview"));
    await waitFor(() =>
      expect(mockAcquire).toHaveBeenCalledWith(expect.objectContaining({ preview: true })),
    );
    fireEvent.click(screen.getByTestId("scan-official"));
    await waitFor(() => expect(screen.getByTestId("scan-page-picker")).toBeInTheDocument());
    expect(screen.getByTestId("scan-page-count")).toHaveTextContent("2 of 2 selected");
    fireEvent.click(screen.getByTestId("scan-page-select-1"));
    expect(screen.getByTestId("scan-page-count")).toHaveTextContent("1 of 2 selected");
    fireEvent.click(screen.getByTestId("scan-create"));
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith([pageA], expect.objectContaining({ dpi: 300 })),
    );
    expect(useUiStore.getState().showScanDialog).toBe(false);
  });

  it("disables import until a page is selected", async () => {
    render(<ScanDialog />);
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId("scan-preview"));
    await waitFor(() => screen.getByTestId("scan-preview-image"));
    fireEvent.click(screen.getByTestId("scan-official"));
    await waitFor(() => screen.getByTestId("scan-page-picker"));
    fireEvent.click(screen.getByTestId("scan-select-none"));
    expect(screen.getByTestId("scan-create")).toBeDisabled();
  });

  it("lets the user size an imported image before adding it to the PDF", async () => {
    mockImport.mockResolvedValue([{ dataBase64: "photo", mimeType: "image/jpeg" }]);
    render(<ScanDialog />);
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId("scan-import"));
    await waitFor(() => expect(screen.getByTestId("import-adjust")).toBeInTheDocument());
    expect(screen.queryByTestId("scan-page-picker")).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId("import-size-preset"), { target: { value: "5x7" } });
    fireEvent.click(screen.getByTestId("import-add-page"));
    await waitFor(() => expect(screen.getByTestId("scan-page-picker")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("scan-create"));
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith(
        [expect.objectContaining({ dataBase64: "photo", pageWidthIn: 5, pageHeightIn: 7 })],
        expect.anything(),
      ),
    );
  });

  it("scans the feeder without a preview crop", async () => {
    mockAcquire.mockReset();
    mockAcquire.mockResolvedValue([pageA]);
    render(<ScanDialog />);
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    fireEvent.change(screen.getByTestId("scan-source"), { target: { value: "feeder" } });
    fireEvent.click(screen.getByTestId("scan-page"));
    await waitFor(() =>
      expect(mockAcquire).toHaveBeenCalledWith(
        expect.objectContaining({ source: "feeder", preview: false, maxPages: 20 }),
      ),
    );
    await waitFor(() => expect(screen.getByTestId("scan-page-picker")).toBeInTheDocument());
  });
});
