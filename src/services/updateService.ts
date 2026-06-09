import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { ask } from "@tauri-apps/plugin-dialog";
import { APP_NAME, APP_VERSION } from "@/lib/constants";
import { log } from "@/lib/logging";
import { toAppErrorPayload } from "@/lib/reportError";
import { useDocumentStore } from "@/stores/documentStore";
import { useUiStore } from "@/stores/uiStore";

export type UpdateCheckOptions = {
  /** When true, do not show a dialog if already up to date (used on startup). */
  silentIfUpToDate?: boolean;
  /** When true, skip the check entirely if the document has unsaved changes. */
  skipIfDirty?: boolean;
  /** Where the check was triggered from (for logs). */
  source?: "menu" | "startup";
};

function setUpdatePhase(
  phase: ReturnType<typeof useUiStore.getState>["updatePhase"],
  message: string,
) {
  useUiStore.getState().setUpdateDialog({ phase, message });
}

function upToDateMessage(): string {
  return `PDF Editor is up to date (version ${APP_VERSION}).`;
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

export async function checkForUpdatesAndApply(
  options: UpdateCheckOptions = {},
): Promise<void> {
  const { silentIfUpToDate = false, skipIfDirty = false, source = "menu" } = options;
  const userAction = source === "startup" ? "auto_update_check" : "check_for_updates";

  if (skipIfDirty && useDocumentStore.getState().isDirty) {
    log.update.info("Skipping automatic update — unsaved document changes", {
      userAction,
    });
    return;
  }

  if (import.meta.env.VITE_E2E) {
    if (!silentIfUpToDate) {
      useUiStore.getState().openUpdateDialog();
      setUpdatePhase("up_to_date", `${upToDateMessage()} (E2E mock).`);
    }
    log.update.info(upToDateMessage(), { userAction, metadata: { status: "up_to_date" } });
    return;
  }

  if (!silentIfUpToDate) {
    useUiStore.getState().openUpdateDialog();
    setUpdatePhase("checking", "Checking for updates…");
  }

  log.update.info("Checking for updates", { userAction });

  try {
    const update = await check();

    if (!update) {
      log.update.info(upToDateMessage(), {
        userAction,
        metadata: { status: "up_to_date", version: APP_VERSION },
      });
      if (silentIfUpToDate) {
        return;
      }
      setUpdatePhase("up_to_date", upToDateMessage());
      return;
    }

    log.update.info(`Update ${update.version} is available`, {
      userAction,
      metadata: { status: "update_available", remoteVersion: update.version },
    });

    if (silentIfUpToDate) {
      useUiStore.getState().openUpdateDialog();
    }

    const canContinue =
      skipIfDirty || source === "startup"
        ? !useDocumentStore.getState().isDirty
        : await confirmDiscardUnsavedChanges();
    if (!canContinue) {
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
    log.update.error(payload.message, {
      userAction,
      errorId: payload.errorId,
      metadata: { code: payload.code },
    });
    if (silentIfUpToDate) {
      return;
    }
    setUpdatePhase(
      "error",
      `${payload.message}\n\nIf this is the first install, publish a signed release (see README).`,
    );
  }
}
