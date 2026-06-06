import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { useDocumentStore } from "@/stores/documentStore";
import { StatusBar } from "./StatusBar";

describe("StatusBar", () => {
  beforeEach(() => {
    useDocumentStore.setState({
      fileName: "report.pdf",
      isDirty: false,
      isLoading: false,
      metadata: { pageCount: 10, fileSize: 2048 },
      isPasswordProtected: false,
      pendingSavePassword: null,
      removePasswordOnSave: false,
      currentPage: 3,
      zoom: 1.25,
      loadError: null,
      statusMessage: null,
    });
  });

  it("shows file name and page info", () => {
    render(<StatusBar />);
    expect(screen.getByText(/report\.pdf/)).toBeInTheDocument();
    expect(screen.getByText("Page 3 of 10")).toBeInTheDocument();
    expect(screen.getByText("125%")).toBeInTheDocument();
    expect(screen.getByText("2.0 KB")).toBeInTheDocument();
  });

  it("shows dirty marker and status messages", () => {
    useDocumentStore.setState({ isDirty: true, statusMessage: "Saved" });
    render(<StatusBar />);
    expect(screen.getByText(/report\.pdf \*/)).toBeInTheDocument();
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("shows password and save security hints", () => {
    useDocumentStore.setState({
      isPasswordProtected: true,
      pendingSavePassword: "secret",
      removePasswordOnSave: true,
    });
    render(<StatusBar />);
    expect(screen.getByText(/Password protected/)).toBeInTheDocument();
    expect(screen.getByText("Will protect on save")).toBeInTheDocument();
    expect(screen.getByText("Will remove password on save")).toBeInTheDocument();
  });

  it("shows load error and loading state", () => {
    useDocumentStore.setState({ loadError: "Could not open file", isLoading: true });
    render(<StatusBar />);
    expect(screen.getByText("Could not open file")).toBeInTheDocument();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });
});
