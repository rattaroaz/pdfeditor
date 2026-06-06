import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAnnotationStore } from "@/stores/annotationStore";
import { useDocumentStore } from "@/stores/documentStore";
import { AnnotationsPanel } from "./AnnotationsPanel";

vi.mock("@/lib/navigateToTarget", () => ({
  navigateToAnnotation: vi.fn(),
}));

describe("AnnotationsPanel", () => {
  beforeEach(() => {
    useAnnotationStore.getState().clearAnnotations();
    useDocumentStore.setState({
      currentPage: 1,
      scrollToPage: null,
      metadata: { pageCount: 10, fileSize: 1000 },
    });
  });

  it("shows empty state when there are no annotations", () => {
    render(<AnnotationsPanel />);
    expect(screen.getByText(/No annotations/)).toBeInTheDocument();
  });

  it("lists annotations and selects on click", async () => {
    const user = userEvent.setup();
    useAnnotationStore.getState().addAnnotation({
      type: "note",
      pageIndex: 1,
      x: 10,
      y: 20,
      content: "Review this section",
      author: "test",
      color: "#FFEB3B",
    });

    render(<AnnotationsPanel />);
    expect(screen.getByText(/Review this section/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Review this section/i }));
    expect(useAnnotationStore.getState().selectedId).toBeTruthy();
    expect(useDocumentStore.getState().currentPage).toBe(2);
  });

  it("filters annotations by type", async () => {
    const user = userEvent.setup();
    useAnnotationStore.getState().addAnnotation({
      type: "highlight",
      pageIndex: 0,
      rects: [{ x: 1, y: 2, width: 3, height: 4 }],
      author: "test",
      color: "#FFEB3B",
    });
    useAnnotationStore.getState().addAnnotation({
      type: "note",
      pageIndex: 0,
      x: 0,
      y: 0,
      content: "Note text",
      author: "test",
      color: "#FFEB3B",
    });

    render(<AnnotationsPanel />);
    expect(screen.getByText(/Note text/)).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox"), "note");
    expect(screen.queryByRole("button", { name: /^Highlight$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Note text/)).toBeInTheDocument();
  });
});
