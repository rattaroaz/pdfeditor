import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { queueScanPages } from "@/lib/scanQueue";
import { ScanPagePicker } from "./ScanPagePicker";

describe("ScanPagePicker", () => {
  it("lets the user review and toggle pages to import", () => {
    const pages = queueScanPages([
      { dataBase64: "aaa", mimeType: "image/jpeg" },
      { dataBase64: "bbb", mimeType: "image/jpeg" },
    ]);
    const onActive = vi.fn();
    const onToggle = vi.fn();
    const onRemove = vi.fn();
    const onSelectAll = vi.fn();

    render(
      <ScanPagePicker
        pages={pages}
        activeId={pages[0].id}
        onActive={onActive}
        onToggle={onToggle}
        onRemove={onRemove}
        onSelectAll={onSelectAll}
      />,
    );

    expect(screen.getByTestId("scan-page-active")).toBeInTheDocument();
    expect(screen.getByTestId("scan-page-count")).toHaveTextContent("2 of 2 selected");
    fireEvent.click(screen.getByTestId("scan-page-thumb-1"));
    expect(onActive).toHaveBeenCalledWith(pages[1].id);
    fireEvent.click(screen.getByTestId("scan-page-select-0"));
    expect(onToggle).toHaveBeenCalledWith(pages[0].id, false);
    fireEvent.click(screen.getByTestId("scan-page-remove-1"));
    expect(onRemove).toHaveBeenCalledWith(pages[1].id);
    fireEvent.click(screen.getByTestId("scan-select-none"));
    expect(onSelectAll).toHaveBeenCalledWith(false);
  });
});
