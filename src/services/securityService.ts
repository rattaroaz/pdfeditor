import { createErrorReporter, log } from "@/lib/logging";
import { requestPassword } from "@/lib/passwordPrompt";
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

/** Decrypt an opened file so later lopdf mutations run on plaintext. */
export async function unlockPdfBytesIfEncrypted(
  pdfBytes: Uint8Array,
  password: string | undefined,
  isEncrypted: boolean,
): Promise<Uint8Array> {
  if (!isEncrypted || !password) return pdfBytes;
  try {
    return await decryptPdfBytes(pdfBytes, password);
  } catch {
    log.security.warn("Could not decrypt working copy; edits and save may fail", {
      userAction: "open",
    });
    return pdfBytes;
  }
}

async function promptForNewPassword(): Promise<string | null> {
  return requestPassword({
    title: "Protect PDF",
    message: "Set a password required to open this PDF.",
    confirm: true,
  });
}

async function promptForCurrentPassword(hint?: string): Promise<string | null> {
  return requestPassword({
    title: "Password required",
    message: hint ?? "This document is password protected. Enter the current password.",
  });
}

export async function protectDocumentOnNextSave(): Promise<void> {
  const password = await promptForNewPassword();
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
    store.documentPassword ??
    (await promptForCurrentPassword("Enter the password to remove protection."));
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

  // Working copy is plaintext after open; write the file encrypted again.
  if (store.isPasswordProtected && store.documentPassword) {
    return encryptPdfBytes(pdfBytes, store.documentPassword);
  }

  return pdfBytes;
}
