import { log } from "@/lib/logging";
import { invokeLogged } from "@/lib/tauriInvoke";
import { decodeBase64Pdf, encodeBase64Pdf } from "@/lib/pdf/pdfEngine";
import { useDocumentStore } from "@/stores/documentStore";
import { useUiStore } from "@/stores/uiStore";
import { errorMessage } from "@/lib/parseInvokeError";

export interface PdfSecurityInfo {
  isEncrypted: boolean;
  requiresPassword: boolean;
}

interface PdfBytesResult {
  dataBase64: string;
}

function showError(err: unknown): void {
  const errorId = crypto.randomUUID();
  log.security.error("Security operation failed", {
    userAction: "security",
    errorId,
    metadata: { message: errorMessage(err) },
  });
  useUiStore.getState().showError({
    errorId,
    message: errorMessage(err),
  });
}

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

export async function decryptPdfBytes(
  pdfBytes: Uint8Array,
  password: string,
): Promise<Uint8Array> {
  const result = await invokeLogged<PdfBytesResult>("decrypt_pdf", {
    pdfBase64: encodeBase64Pdf(pdfBytes),
    password,
  });
  return decodeBase64Pdf(result.dataBase64);
}

export function promptForNewPassword(): string | null {
  const userPassword = window.prompt(
    "Set a password required to open this PDF.\n\nLeave blank to cancel.",
  );
  if (!userPassword) return null;

  const confirm = window.prompt("Confirm password:");
  if (!confirm) return null;
  if (userPassword !== confirm) {
    window.alert("Passwords do not match. Password protection was not applied.");
    return null;
  }
  return userPassword;
}

export function promptForCurrentPassword(hint?: string): string | null {
  return window.prompt(
    hint ?? "This document is password protected. Enter the current password:",
  );
}

export function protectDocumentOnNextSave(): void {
  const password = promptForNewPassword();
  if (!password) return;

  const store = useDocumentStore.getState();
  store.setPendingSavePassword(password);
  store.setRemovePasswordOnSave(false);
  store.setDirty(true);
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
  store.setDirty(true);
  store.setStatusMessage("Password will be removed when you save");
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
