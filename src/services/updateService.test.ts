import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockInvoke, mockAsk } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockAsk: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  ask: mockAsk,
}));

import { clearLogBuffer, getLogEntries, logger } from "@/lib/logging";
import { checkForUpdatesAndApply } from "./updateService";
import { useDocumentStore } from "@/stores/documentStore";
import { useUiStore } from "@/stores/uiStore";

describe("updateService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLogBuffer();
    logger.setBackendShipping(false);
    mockInvoke.mockImplementation((command: string) => {
      if (command === "log_frontend_event") return Promise.resolve();
      return Promise.resolve(undefined);
    });
    useUiStore.setState({
      showUpdateDialog: false,
      updatePhase: "idle",
      updateMessage: "",
    });
    useDocumentStore.setState({ isDirty: false });
  });

  it("shows up to date message when commits match", async () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === "check_for_updates") {
        return Promise.resolve({
          status: "up_to_date",
          localVersion: "1.1.0",
          localCommit: "abc1234",
          remoteCommit: "abc1234",
          message: "PDF Editor is up to date.",
        });
      }
      return Promise.resolve(undefined);
    });

    await checkForUpdatesAndApply();

    expect(useUiStore.getState().updatePhase).toBe("up_to_date");
    expect(mockInvoke).toHaveBeenCalledWith("check_for_updates", undefined);
    const entry = getLogEntries().find((e) => e.context?.category === "update");
    expect(entry?.context?.userAction).toBe("check_for_updates");
  });

  it("downloads and applies when a newer commit is available", async () => {
    mockInvoke.mockImplementation((command: string, args?: unknown) => {
      if (command === "check_for_updates") {
        return Promise.resolve({
          status: "update_available",
          localVersion: "1.1.0",
          localCommit: "oldcommit",
          remoteCommit: "newcommit",
          installerUrl: "https://example.com/setup.exe",
          installerName: "PDF Editor-setup.exe",
          message: "Update available",
        });
      }
      if (command === "apply_app_update") {
        expect(args).toEqual({
          installerUrl: "https://example.com/setup.exe",
          installerName: "PDF Editor-setup.exe",
        });
        return Promise.resolve({
          status: "installing",
          message: "Installer launched.",
        });
      }
      return Promise.resolve(undefined);
    });

    await checkForUpdatesAndApply();

    expect(mockInvoke).toHaveBeenCalledWith("apply_app_update", {
      installerUrl: "https://example.com/setup.exe",
      installerName: "PDF Editor-setup.exe",
    });
    expect(useUiStore.getState().updatePhase).toBe("installing");
  });

  it("shows error when update is available without installer asset", async () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === "check_for_updates") {
        return Promise.resolve({
          status: "update_available",
          localVersion: "1.1.0",
          localCommit: "old",
          remoteCommit: "new",
          releaseUrl: "https://github.com/rattaroaz/pdfeditor/releases/latest",
          message: "No installer found.",
        });
      }
      return Promise.resolve(undefined);
    });

    await checkForUpdatesAndApply();

    expect(useUiStore.getState().updatePhase).toBe("error");
    expect(mockInvoke).not.toHaveBeenCalledWith("apply_app_update", expect.anything());
  });

  it("cancels when the user declines discarding unsaved changes", async () => {
    useDocumentStore.setState({ isDirty: true });
    mockAsk.mockResolvedValueOnce(false);
    mockInvoke.mockImplementation((command: string) => {
      if (command === "check_for_updates") {
        return Promise.resolve({
          status: "update_available",
          localVersion: "1.1.0",
          localCommit: "oldcommit",
          remoteCommit: "newcommit",
          installerUrl: "https://example.com/setup.exe",
          installerName: "PDF Editor-setup.exe",
          message: "Update available",
        });
      }
      return Promise.resolve(undefined);
    });

    await checkForUpdatesAndApply();

    expect(mockInvoke).not.toHaveBeenCalledWith("apply_app_update", expect.anything());
    expect(useUiStore.getState().showUpdateDialog).toBe(false);
    expect(
      getLogEntries().some((e) => e.message.includes("cancelled")),
    ).toBe(true);
  });

  it("surfaces invoke failures in the update dialog", async () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === "check_for_updates") {
        return Promise.reject(
          JSON.stringify({
            errorId: "upd-1",
            message: "Failed to reach GitHub",
            code: "PDF_ERROR",
          }),
        );
      }
      return Promise.resolve(undefined);
    });

    await checkForUpdatesAndApply();

    expect(useUiStore.getState().updatePhase).toBe("error");
    expect(useUiStore.getState().updateMessage).toContain("Failed to reach GitHub");
  });
});
