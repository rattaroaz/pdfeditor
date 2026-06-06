import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAnnotationStore } from "@/stores/annotationStore";
import { useDocumentStore } from "@/stores/documentStore";
import { useUiStore } from "@/stores/uiStore";
import { SearchBar } from "./SearchBar";

const { mockSearchDocument } = vi.hoisted(() => ({
  mockSearchDocument: vi.fn(),
}));

vi.mock("@/lib/pdf/pdfEngine", () => ({
  searchDocument: mockSearchDocument,
}));

describe("SearchBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    useUiStore.setState({
      showSearch: true,
      searchQuery: "",
      searchMatches: [],
      activeMatchIndex: 0,
      caseSensitive: false,
      wholeWord: false,
      searchAnnotations: true,
    });
    useDocumentStore.setState({
      pdfDoc: { numPages: 1 } as never,
      currentPage: 1,
      scrollToPage: null,
    });
    useAnnotationStore.getState().clearAnnotations();
    mockSearchDocument.mockResolvedValue([
      { pageIndex: 0, rects: [{ x: 1, y: 2, width: 3, height: 4 }] },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing when search is hidden", () => {
    useUiStore.setState({ showSearch: false });
    const { container } = render(<SearchBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it("searches document text after debounce", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);

    await user.type(screen.getByPlaceholderText(/Find in document/i), "hello");
    expect(screen.getByText("No matches")).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(300);

    await waitFor(() => {
      expect(mockSearchDocument).toHaveBeenCalledWith(
        expect.anything(),
        "hello",
        false,
        false,
      );
    });
    await waitFor(() => {
      expect(screen.getByText("1 / 1")).toBeInTheDocument();
    });
  });

  it("toggles search options and closes on escape", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);

    await user.click(screen.getByLabelText("Match case"));
    expect(useUiStore.getState().caseSensitive).toBe(true);

    await user.type(screen.getByPlaceholderText(/Find in document/i), "{Escape}");
    expect(useUiStore.getState().showSearch).toBe(false);
  });
});
