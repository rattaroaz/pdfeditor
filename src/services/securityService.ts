import { showAlert } from "@/lib/appDialog";
import { createErrorReporter, log } from "@/lib/logging";
import { invokeLogged } from "@/lib/tauriInvoke";
import { decodeBase64Pdf, encodeBase64Pdf } from "@/lib/pdf/pdfEngine";
import type { PdfBytesResult } from "@/lib/pdf/pdfBinary";
import { useDocumentStore } from "@/stores/documentStore";

export interface PdfSecurityInfo {
  isEncrypted: boolean;
  requiresPassword: boolean;
}

const showError = createErrorReporter("security", "security");

export async function inspectPdfSecurity(pdfBytes: Uint8Array): Promise<PdfSecurityInfo> {
  return invokeLogged<PdfSecurityInfo>("inspect_pdf_security", {
    pdfBase64: encodeBase64Pdf(pdfBytes),
  });
}

export async function encryptPdfBytes(
  pdfBytes: Uint8Array,
  userPassword: string,
  options?: { ownerPassword?: string; currentPassword?: string },
): Promise<Uint8Array> {
  const result = await invokeLogged<PdfBytesResult>("encrypt_pdf", {
    pdfBase64: encodeBase64Pdf(pdfBytes),
    userPassword,
    ownerPassword: options?.ownerPassword ?? null,
    currentPassword: options?.currentPassword ?? null,
  });
  return decodeBase64Pdf(result.dataBase64);
}

async function decryptPdfBytes(
  pdfBytes: Uint8Array,
  password: string,
): Promise<Uint8Array> {
  const result = await invokeLogged<PdfBytesResult>("decrypt_pdf", {
    pdfBase64: encodeBase64Pdf(pdfBytes),
    password,
  });
  return decodeBase64Pdf(result.dataBase64);
}

function promptForNewPassword(): string | null {
  const userPassword = window.prompt(
    "Set a password required to open this PDF.\n\nLeave blank to cancel.",
  );
  if (!userPassword) return null;

  const confirm = window.prompt("Confirm password:");
  if (!confirm) return null;
  if (userPassword !== confirm) {
    void showAlert(
      "Passwords do not match. Password protection was not applied.",
      "warning",
    );
    return null;
  }
  return userPassword;
}

function promptForCurrentPassword(hint?: string): string | null {
  return window.prompt(
    hint ?? "This document is password protected. Enter the current password:",
  );
}

export function protectDocumentOnNextSave(): void {
  const password = promptForNewPassword();
  if (!password) return;

  log.security.info("Password protection scheduled for next save", {
    userAction: "protect_on_save",
  });
  const store = useDocumentStore.getState();
  store.setPendingSavePassword(password);
  store.setRemovePasswordOnSave(false);
  store.markDocumentChanged("security");
  store.setStatusMessage("Password protection will be applied when you save");
}

export async function removeDocumentPasswordProtection(): Promise<void> {
  const store = useDocumentStore.getState();
  if (!store.isPasswordProtected && !store.pendingSavePassword) {
    showError(new Error("This document is not password protected"));
    return;
  }

  const password =
    store.documentPassword ?? promptForCurrentPassword("Enter the password to remove protection:");
  if (!password) return;

  store.setPendingSavePassword(null);
  store.setRemovePasswordOnSave(true);
  store.setDocumentPassword(password);
  store.markDocumentChanged("security");
  store.setStatusMessage("Password will be removed when you save");
  log.security.info("Password removal scheduled for next save", {
    userAction: "remove_password_on_save",
  });
}

export async function applySecurityOnSaveBytes(pdfBytes: Uint8Array): Promise<Uint8Array> {
  const store = useDocumentStore.getState();

  if (store.removePasswordOnSave) {
    const password = store.documentPassword;
    if (!password) {
      throw new Error("Current password is required to remove protection");
    }
    const decrypted = await decryptPdfBytes(pdfBytes, password);
    store.clearSecuritySaveFlags();
    store.setPasswordProtected(false);
    store.setDocumentPassword(null);
    return decrypted;
  }

  if (store.pendingSavePassword) {
    const encrypted = await encryptPdfBytes(pdfBytes, store.pendingSavePassword, {
      currentPassword: store.documentPassword ?? undefined,
    });
    store.clearSecuritySaveFlags();
    store.setPasswordProtected(true);
    store.setDocumentPassword(store.pendingSavePassword);
    return encrypted;
  }

  return pdfBytes;
}
