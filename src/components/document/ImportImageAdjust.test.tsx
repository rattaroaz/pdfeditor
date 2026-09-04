import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImportImageAdjust } from "./ImportImageAdjust";

const gif =
  "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

describe("ImportImageAdjust", () => {
  it("adds the imported image with the chosen page size", async () => {
    const onAdd = vi.fn();
    render(
      <ImportImageAdjust
        draft={{ id: "d1", image: { dataBase64: gif, mimeType: "image/gif" } }}
        remaining={1}
        paperSize="auto"
        busy={false}
        onAdd={onAdd}
        onSkip={vi.fn()}
      />,
    );

    expect(screen.getByTestId("import-adjust")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("import-size-preset"), { target: { value: "4x6" } });
    expect(screen.getByTestId("import-width")).toHaveValue(4);
    expect(screen.getByTestId("import-height")).toHaveValue(6);
    fireEvent.click(screen.getByTestId("import-add-page"));
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith(
        expect.objectContaining({ pageWidthIn: 4, pageHeightIn: 6 }),
      ),
    );
  });
});
