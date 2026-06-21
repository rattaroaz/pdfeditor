import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { ask } from "@tauri-apps/plugin-dialog";
import { APP_NAME, APP_VERSION } from "@/lib/constants";
import { log } from "@/lib/logging";
import { isVersionNewer } from "@/lib/semver";
import { toAppErrorPayload } from "@/lib/reportError";
import { useDocumentStore } from "@/stores/documentStore";
import { useUiStore } from "@/stores/uiStore";

function setUpdatePhase(
  phase: ReturnType<typeof useUiStore.getState>["updatePhase"],
  message: string,
) {
  useUiStore.getState().setUpdateDialog({ phase, message });
}

function upToDateMessage(): string {
  return `PDF Editor is up to date (version ${APP_VERSION}).`;
}

const UPDATE_FEED_UNAVAILABLE_MESSAGE =
  "No update feed is published yet. Bump the app version and push a matching tag (for example v1.4.3) after adding TAURI_SIGNING_PRIVATE_KEY to GitHub Actions secrets so the Release workflow can upload latest.json.";

const UPDATE_PLATFORM_MISSING_ARM64_MESSAGE =
  "This release does not include an in-app update for Windows on ARM (ARM64). Install the ARM64 setup (.exe) from the GitHub release page, or wait until a release publishes windows-aarch64 entries in latest.json.";

function isUpdateFeedUnavailable(message: string): boolean {
  if (isMissingPlatformUpdate(message)) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("could not fetch a valid release json") ||
    lower.includes("failed to fetch") ||
    lower.includes("404") ||
    (lower.includes("release") && lower.includes("not found"))
  );
}

/** True when latest.json exists but has no bundle for this CPU architecture. */
export function isMissingPlatformUpdate(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("targetnotfound") ||
    lower.includes("target not found") ||
    lower.includes("targetsnotfound") ||
    lower.includes("targets not found") ||
    lower.includes("unsupportedarch") ||
    lower.includes("unsupported arch") ||
    lower.includes("fallback platforms") ||
    lower.includes("were not found in the response") ||
    (lower.includes("platform") && lower.includes("not found"))
  );
}

export function missingPlatformUpdateMessage(message: string): string | null {
  if (!isMissingPlatformUpdate(message)) return null;
  const lower = message.toLowerCase();
  if (lower.includes("aarch64") || lower.includes("arm64")) {
    return UPDATE_PLATFORM_MISSING_ARM64_MESSAGE;
  }
  if (lower.includes("x86_64") || lower.includes("x64")) {
    return "This release does not include an in-app update for 64-bit Intel/AMD Windows. Download the x64 installer from the GitHub release page.";
  }
  return "This release does not include an in-app update for this PC architecture. Download the matching installer from the GitHub release page.";
}

function resolveUpdateErrorMessage(message: string): string | null {
  const platformMessage = missingPlatformUpdateMessage(message);
  if (platformMessage) return platformMessage;
  if (isUpdateFeedUnavailable(message)) return UPDATE_FEED_UNAVAILABLE_MESSAGE;
  return null;
}

async function confirmDiscardUnsavedChanges(): Promise<boolean> {
  const { isDirty } = useDocumentStore.getState();
  if (!isDirty) return true;

  const confirmed = await ask("You have unsaved changes. Continue updating without saving?", {
    title: APP_NAME,
    kind: "warning",
  });

  if (!confirmed) {
    log.update.info("Update cancelled — user kept unsaved changes", {
      userAction: "check_for_updates",
    });
  }

  return confirmed;
}

/** Check for updates when the user chooses Help → Check for updates. */
export async function checkForUpdatesAndApply(): Promise<void> {
  const userAction = "check_for_updates";

  if (import.meta.env.VITE_E2E) {
    useUiStore.getState().openUpdateDialog();
    setUpdatePhase("up_to_date", `${upToDateMessage()} (E2E mock).`);
    log.update.info(upToDateMessage(), { userAction, metadata: { status: "up_to_date" } });
    return;
  }

  useUiStore.getState().openUpdateDialog();
  setUpdatePhase("checking", "Checking for updates…");

  log.update.info("Checking for a newer app version", {
    userAction,
    metadata: { installedVersion: APP_VERSION },
  });

  try {
    const update = await check({ allowDowngrades: false });

    if (!update || !isVersionNewer(update.version, APP_VERSION)) {
      const remoteVersion = update?.version ?? null;
      log.update.info(upToDateMessage(), {
        userAction,
        metadata: {
          status: "up_to_date",
          installedVersion: APP_VERSION,
          remoteVersion,
        },
      });
      setUpdatePhase("up_to_date", upToDateMessage());
      return;
    }

    log.update.info(`Newer version ${update.version} is available (installed ${APP_VERSION})`, {
      userAction,
      metadata: {
        status: "update_available",
        installedVersion: APP_VERSION,
        remoteVersion: update.version,
      },
    });

    if (!(await confirmDiscardUnsavedChanges())) {
      useUiStore.getState().closeUpdateDialog();
      return;
    }

    setUpdatePhase(
      "downloading",
      `Version ${update.version} is available. Downloading in the background…`,
    );

    await update.downloadAndInstall((event) => {
      if (event.event === "Started") {
        log.update.info("Update download started", {
          userAction: "download_update",
          metadata: { contentLength: event.data.contentLength ?? null },
        });
      } else if (event.event === "Finished") {
        log.update.info("Update download finished", { userAction: "download_update" });
      }
    });

    setUpdatePhase("installing", "Installing update. The app will restart automatically.");
    log.update.info("Update installed, relaunching", { userAction: "install_update" });
    await relaunch();
  } catch (err) {
    const payload = toAppErrorPayload(err);
    const friendlyMessage = resolveUpdateErrorMessage(payload.message);

    if (friendlyMessage === UPDATE_FEED_UNAVAILABLE_MESSAGE) {
      log.update.info("Update feed not published yet", {
        userAction,
        metadata: { status: "no_update_feed" },
      });
      setUpdatePhase("error", friendlyMessage);
      return;
    }

    if (friendlyMessage) {
      log.update.info("Update feed missing platform artifact", {
        userAction,
        metadata: { status: "missing_platform", message: payload.message },
      });
      setUpdatePhase("error", friendlyMessage);
      return;
    }

    log.update.error(payload.message, {
      userAction,
      errorId: payload.errorId,
      metadata: { code: payload.code },
    });
    setUpdatePhase("error", payload.message);
  }
}
