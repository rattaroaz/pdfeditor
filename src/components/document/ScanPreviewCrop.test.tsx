import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScanPreviewCrop } from "./ScanPreviewCrop";

describe("ScanPreviewCrop", () => {
  it("shows the preview and selection size", () => {
    render(
      <ScanPreviewCrop
        src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="
        region={{ x: 0.1, y: 0.1, width: 0.5, height: 0.4 }}
        onChange={vi.fn()}
        previewDpi={75}
        officialDpi={300}
      />,
    );
    expect(screen.getByTestId("scan-preview-image")).toBeInTheDocument();
    expect(screen.getByTestId("scan-preview-size")).toHaveTextContent("official scan");
    expect(screen.getByTestId("scan-crop-move")).toBeInTheDocument();
    expect(screen.getByTestId("scan-crop-se")).toBeInTheDocument();
  });
});
