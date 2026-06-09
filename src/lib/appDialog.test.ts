import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockConfirm, mockMessage } = vi.hoisted(() => ({
  mockConfirm: vi.fn(),
  mockMessage: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: mockConfirm,
  message: mockMessage,
}));

import { showAlert, showConfirm } from "./appDialog";

describe("appDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfirm.mockResolvedValue(true);
    mockMessage.mockResolvedValue(undefined);
  });

  it("showConfirm delegates to the dialog plugin", async () => {
    await showConfirm("Delete page?");
    expect(mockConfirm).toHaveBeenCalledWith("Delete page?", {
      title: "PDF Editor",
      kind: "warning",
    });
  });

  it("showAlert delegates to the dialog plugin", async () => {
    await showAlert("Saved.", "info");
    expect(mockMessage).toHaveBeenCalledWith("Saved.", {
      title: "PDF Editor",
      kind: "info",
    });
  });
});
