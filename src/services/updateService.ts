import { ask } from "@tauri-apps/plugin-dialog";
import { APP_NAME } from "@/lib/constants";
import { log } from "@/lib/logging";
import { toAppErrorPayload } from "@/lib/reportError";
import { invokeLogged } from "@/lib/tauriInvoke";
import { useDocumentStore } from "@/stores/documentStore";
import { useUiStore } from "@/stores/uiStore";
import type { ApplyUpdateResult, UpdateCheckResult } from "@shared/types";

function setUpdatePhase(
  phase: ReturnType<typeof useUiStore.getState>["updatePhase"],
  message: string,
) {
  useUiStore.getState().setUpdateDialog({ phase, message });
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

export async function checkForUpdatesAndApply(): Promise<void> {
  useUiStore.getState().openUpdateDialog();
  setUpdatePhase("checking", "Checking GitHub for the latest build…");
  log.update.info("Checking GitHub for updates", { userAction: "check_for_updates" });

  try {
    const result = await invokeLogged<UpdateCheckResult>("check_for_updates");
    log.update.info(result.message, {
      userAction: "check_for_updates",
      metadata: {
        status: result.status,
        localCommit: result.localCommit,
        remoteCommit: result.remoteCommit,
        remoteVersion: result.remoteVersion,
      },
    });

    if (result.status === "up_to_date") {
      setUpdatePhase("up_to_date", result.message);
      return;
    }

    if (
      result.status === "no_release" ||
      result.status === "no_installer" ||
      !result.installerUrl ||
      !result.installerName
    ) {
      log.update.warn("Update available but installer not ready", {
        userAction: "check_for_updates",
        metadata: {
          status: result.status,
          releaseUrl: result.releaseUrl,
        },
      });
      setUpdatePhase("error", result.message);
      return;
    }

    const canContinue = await confirmDiscardUnsavedChanges();
    if (!canContinue) {
      useUiStore.getState().closeUpdateDialog();
      return;
    }

    setUpdatePhase(
      "downloading",
      "A newer build was found. Downloading the latest installer from GitHub…",
    );
    log.update.info("Downloading update installer", {
      userAction: "apply_app_update",
      metadata: { installerName: result.installerName },
    });

    const applyResult = await invokeLogged<ApplyUpdateResult>("apply_app_update", {
      installerUrl: result.installerUrl,
      installerName: result.installerName,
    });

    log.update.info(applyResult.message, { userAction: "apply_app_update" });
    setUpdatePhase("installing", applyResult.message);
  } catch (err) {
    const payload = toAppErrorPayload(err);
    setUpdatePhase("error", payload.message);
    log.update.error(payload.message, {
      userAction: "check_for_updates",
      errorId: payload.errorId,
      metadata: { code: payload.code },
    });
  }
}
