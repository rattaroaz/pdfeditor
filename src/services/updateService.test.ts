import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCheck, mockRelaunch, mockAsk, mockDownloadAndInstall } = vi.hoisted(() => ({
  mockCheck: vi.fn(),
  mockRelaunch: vi.fn(),
  mockAsk: vi.fn(),
  mockDownloadAndInstall: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: mockCheck,
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: mockRelaunch,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  ask: mockAsk,
}));

import { clearLogBuffer, getLogEntries } from "@/lib/logging";
import { checkForUpdatesAndApply } from "./updateService";
import { useDocumentStore } from "@/stores/documentStore";
import { useUiStore } from "@/stores/uiStore";

describe("updateService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLogBuffer();
    mockDownloadAndInstall.mockResolvedValue(undefined);
    mockRelaunch.mockResolvedValue(undefined);
    useUiStore.setState({
      showUpdateDialog: false,
      updatePhase: "idle",
      updateMessage: "",
    });
    useDocumentStore.setState({ isDirty: false });
  });

  it("shows up to date message when no update is returned", async () => {
    mockCheck.mockResolvedValue(null);

    await checkForUpdatesAndApply();

    expect(mockCheck).toHaveBeenCalledWith({ allowDowngrades: false });
    expect(useUiStore.getState().updatePhase).toBe("up_to_date");
    expect(useUiStore.getState().updateMessage).toContain("up to date");
    const entry = getLogEntries().find((e) => e.context?.category === "update");
    expect(entry?.context?.userAction).toBe("check_for_updates");
  });

  it("does not download when the remote version is not newer", async () => {
    mockCheck.mockResolvedValue({
      version: "1.1.5",
      downloadAndInstall: mockDownloadAndInstall,
    });

    await checkForUpdatesAndApply();

    expect(mockDownloadAndInstall).not.toHaveBeenCalled();
    expect(useUiStore.getState().updatePhase).toBe("up_to_date");
  });

  it("downloads, installs, and relaunches when a newer version is available", async () => {
    mockCheck.mockResolvedValue({
      version: "1.2.0",
      downloadAndInstall: mockDownloadAndInstall,
    });

    await checkForUpdatesAndApply();

    expect(mockDownloadAndInstall).toHaveBeenCalled();
    expect(mockRelaunch).toHaveBeenCalled();
    expect(useUiStore.getState().updatePhase).toBe("installing");
  });

  it("cancels when the user declines discarding unsaved changes", async () => {
    useDocumentStore.setState({ isDirty: true });
    mockAsk.mockResolvedValueOnce(false);
    mockCheck.mockResolvedValue({
      version: "1.2.0",
      downloadAndInstall: mockDownloadAndInstall,
    });

    await checkForUpdatesAndApply();

    expect(mockDownloadAndInstall).not.toHaveBeenCalled();
    expect(useUiStore.getState().showUpdateDialog).toBe(false);
  });

  it("does not show dialog on silent startup when already up to date", async () => {
    mockCheck.mockResolvedValue(null);

    await checkForUpdatesAndApply({ silentIfUpToDate: true, source: "startup" });

    expect(useUiStore.getState().showUpdateDialog).toBe(false);
    expect(useUiStore.getState().updatePhase).toBe("idle");
  });

  it("silent startup downloads when a newer semver is published", async () => {
    mockCheck.mockResolvedValue({
      version: "1.2.0",
      downloadAndInstall: mockDownloadAndInstall,
    });

    await checkForUpdatesAndApply({
      silentIfUpToDate: true,
      skipIfDirty: true,
      source: "startup",
    });

    expect(mockCheck).toHaveBeenCalledWith({ allowDowngrades: false });
    expect(mockDownloadAndInstall).toHaveBeenCalled();
    expect(useUiStore.getState().updatePhase).toBe("installing");
    expect(
      getLogEntries().some(
        (entry) =>
          entry.context?.userAction === "auto_update_check" &&
          entry.context?.metadata?.status === "update_available",
      ),
    ).toBe(true);
  });

  it("silent startup skips download when the document has unsaved changes", async () => {
    useDocumentStore.setState({ isDirty: true });
    mockCheck.mockResolvedValue({
      version: "1.2.0",
      downloadAndInstall: mockDownloadAndInstall,
    });

    await checkForUpdatesAndApply({
      silentIfUpToDate: true,
      skipIfDirty: true,
      source: "startup",
    });

    expect(mockDownloadAndInstall).not.toHaveBeenCalled();
    expect(
      getLogEntries().some((entry) => entry.message.includes("Skipping automatic update")),
    ).toBe(true);
  });

  it("surfaces updater failures in the update dialog", async () => {
    mockCheck.mockRejectedValue(new Error("Failed to reach update server"));

    await checkForUpdatesAndApply();

    expect(useUiStore.getState().updatePhase).toBe("error");
    expect(useUiStore.getState().updateMessage).toContain("Failed to reach update server");
  });

  it("treats a missing release feed as non-fatal on silent startup", async () => {
    mockCheck.mockRejectedValue(
      new Error("Could not fetch a valid release JSON from the remote"),
    );

    await checkForUpdatesAndApply({ silentIfUpToDate: true, source: "startup" });

    expect(useUiStore.getState().showUpdateDialog).toBe(false);
    expect(
      getLogEntries().some((entry) => entry.message.includes("Update feed not published yet")),
    ).toBe(true);
    expect(
      getLogEntries().some((entry) => entry.level === "error" && entry.context?.category === "update"),
    ).toBe(false);
  });

  it("shows setup guidance when the release feed is missing from the Help menu", async () => {
    mockCheck.mockRejectedValue(
      new Error("Could not fetch a valid release JSON from the remote"),
    );

    await checkForUpdatesAndApply();

    expect(useUiStore.getState().updatePhase).toBe("error");
    expect(useUiStore.getState().updateMessage).toContain("No update feed is published yet");
  });
});
