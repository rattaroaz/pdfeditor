import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { useDocumentStore } from "@/stores/documentStore";
import { MetadataPanel } from "./MetadataPanel";

describe("MetadataPanel", () => {
  beforeEach(() => {
    useDocumentStore.setState({
      fileName: "manual.pdf",
      filePath: "C:\\docs\\manual.pdf",
      metadata: {
        title: "User Manual",
        author: "Acme Corp",
        pageCount: 42,
        fileSize: 1_048_576,
      },
      isPasswordProtected: false,
      pendingSavePassword: null,
    });
  });

  it("renders nothing without metadata", () => {
    useDocumentStore.setState({ metadata: null });
    const { container } = render(<MetadataPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows document metadata rows", () => {
    render(<MetadataPanel />);
    expect(screen.getByText("User Manual")).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("1.0 MB")).toBeInTheDocument();
    expect(screen.getByText("No password (open access)")).toBeInTheDocument();
  });

  it("highlights password-protected security status", () => {
    useDocumentStore.setState({ isPasswordProtected: true });
    render(<MetadataPanel />);
    expect(screen.getByText("Password protected")).toBeInTheDocument();
  });
});
