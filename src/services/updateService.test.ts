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
import { parseSemver } from "@/lib/semver";
import { checkForUpdatesAndApply } from "./updateService";
import { useDocumentStore } from "@/stores/documentStore";
import { useUiStore } from "@/stores/uiStore";
import { APP_VERSION } from "@/lib/constants";

function newerRemoteVersion(): string {
  const parts = parseSemver(APP_VERSION);
  if (!parts) return "99.0.0";
  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}

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
      version: APP_VERSION,
      downloadAndInstall: mockDownloadAndInstall,
    });

    await checkForUpdatesAndApply();

    expect(mockDownloadAndInstall).not.toHaveBeenCalled();
    expect(useUiStore.getState().updatePhase).toBe("up_to_date");
  });

  it("downloads, installs, and relaunches when a newer version is available", async () => {
    mockCheck.mockResolvedValue({
      version: newerRemoteVersion(),
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
      version: newerRemoteVersion(),
      downloadAndInstall: mockDownloadAndInstall,
    });

    await checkForUpdatesAndApply();

    expect(mockDownloadAndInstall).not.toHaveBeenCalled();
    expect(useUiStore.getState().showUpdateDialog).toBe(false);
  });

  it("surfaces updater failures in the update dialog", async () => {
    mockCheck.mockRejectedValue(new Error("Failed to reach update server"));

    await checkForUpdatesAndApply();

    expect(useUiStore.getState().updatePhase).toBe("error");
    expect(useUiStore.getState().updateMessage).toContain("Failed to reach update server");
  });

  it("shows setup guidance when the release feed is missing from the Help menu", async () => {
    mockCheck.mockRejectedValue(
      new Error("Could not fetch a valid release JSON from the remote"),
    );

    await checkForUpdatesAndApply();

    expect(useUiStore.getState().updatePhase).toBe("error");
    expect(useUiStore.getState().updateMessage).toContain("No update feed is published yet");
  });

  it("explains when the release feed has no build for this platform", async () => {
    mockCheck.mockRejectedValue(
      new Error(
        'None of the fallback platforms `["windows-aarch64-msi", "windows-aarch64"]` were found in the response `platforms` object',
      ),
    );

    await checkForUpdatesAndApply();

    expect(useUiStore.getState().updatePhase).toBe("error");
    expect(useUiStore.getState().updateMessage).toContain("ARM64");
    expect(useUiStore.getState().updateMessage).toContain("x64");
  });
});
