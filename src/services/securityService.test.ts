import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeBase64Pdf } from "@/lib/pdf/pdfBinary";
import { useDocumentStore } from "@/stores/documentStore";

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const PDF_BASE64 = encodeBase64Pdf(PDF_BYTES);

const mockInvokeLogged = vi.hoisted(() => vi.fn());
const mockRequestPassword = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tauriInvoke", () => ({
  invokeLogged: mockInvokeLogged,
}));

vi.mock("@/lib/passwordPrompt", () => ({
  requestPassword: mockRequestPassword,
}));

vi.mock("@/lib/pdf/pdfEngine", () => ({
  encodeBase64Pdf: (bytes: Uint8Array) => encodeBase64Pdf(bytes),
  decodeBase64Pdf: () => PDF_BYTES.slice(),
}));

import {
  applySecurityOnSaveBytes,
  encryptPdfBytes,
  inspectPdfSecurity,
  protectDocumentOnNextSave,
  removeDocumentPasswordProtection,
  unlockPdfBytesIfEncrypted,
} from "./securityService";

describe("securityService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDocumentStore.getState().clearSecuritySaveFlags();
    useDocumentStore.setState({
      pendingSavePassword: null,
      removePasswordOnSave: false,
      documentPassword: null,
      isPasswordProtected: false,
    });
    mockInvokeLogged.mockImplementation(async (cmd: string) => {
      if (cmd === "inspect_pdf_security") {
        return { isEncrypted: false, requiresPassword: false };
      }
      if (cmd === "encrypt_pdf" || cmd === "decrypt_pdf") {
        return { dataBase64: PDF_BASE64 };
      }
      throw new Error(`unexpected: ${cmd}`);
    });
  });

  it("inspectPdfSecurity invokes backend", async () => {
    const info = await inspectPdfSecurity(PDF_BYTES);
    expect(info.isEncrypted).toBe(false);
    expect(mockInvokeLogged).toHaveBeenCalledWith(
      "inspect_pdf_security",
      expect.objectContaining({ pdfBase64: PDF_BASE64 }),
    );
  });

  it("encryptPdfBytes returns decoded bytes", async () => {
    const out = await encryptPdfBytes(PDF_BYTES, "secret");
    expect(out).toEqual(PDF_BYTES);
    expect(mockInvokeLogged).toHaveBeenCalledWith(
      "encrypt_pdf",
      expect.objectContaining({ userPassword: "secret" }),
    );
  });

  it("applySecurityOnSaveBytes encrypts when pending password set", async () => {
    useDocumentStore.setState({ pendingSavePassword: "new-secret" });
    const out = await applySecurityOnSaveBytes(PDF_BYTES);
    expect(out).toEqual(PDF_BYTES);
    expect(mockInvokeLogged).toHaveBeenCalledWith("encrypt_pdf", expect.any(Object));
    expect(useDocumentStore.getState().isPasswordProtected).toBe(true);
  });

  it("applySecurityOnSaveBytes decrypts when remove flag set", async () => {
    useDocumentStore.setState({
      removePasswordOnSave: true,
      documentPassword: "old-secret",
      isPasswordProtected: true,
    });
    const out = await applySecurityOnSaveBytes(PDF_BYTES);
    expect(out).toEqual(PDF_BYTES);
    expect(mockInvokeLogged).toHaveBeenCalledWith(
      "decrypt_pdf",
      expect.objectContaining({ password: "old-secret" }),
    );
    expect(useDocumentStore.getState().isPasswordProtected).toBe(false);
  });

  it("applySecurityOnSaveBytes passes through when no flags", async () => {
    const out = await applySecurityOnSaveBytes(PDF_BYTES);
    expect(out).toBe(PDF_BYTES);
    expect(mockInvokeLogged).not.toHaveBeenCalled();
  });

  it("applySecurityOnSaveBytes re-encrypts an already protected working copy", async () => {
    useDocumentStore.setState({
      isPasswordProtected: true,
      documentPassword: "keep-secret",
    });
    const out = await applySecurityOnSaveBytes(PDF_BYTES);
    expect(out).toEqual(PDF_BYTES);
    expect(mockInvokeLogged).toHaveBeenCalledWith(
      "encrypt_pdf",
      expect.objectContaining({ userPassword: "keep-secret" }),
    );
  });

  it("unlockPdfBytesIfEncrypted decrypts when the file is protected", async () => {
    const out = await unlockPdfBytesIfEncrypted(PDF_BYTES, "secret", true);
    expect(out).toEqual(PDF_BYTES);
    expect(mockInvokeLogged).toHaveBeenCalledWith(
      "decrypt_pdf",
      expect.objectContaining({ password: "secret" }),
    );
  });

  it("unlockPdfBytesIfEncrypted skips decrypt when not encrypted", async () => {
    const out = await unlockPdfBytesIfEncrypted(PDF_BYTES, "secret", false);
    expect(out).toBe(PDF_BYTES);
    expect(mockInvokeLogged).not.toHaveBeenCalled();
  });

  it("protectDocumentOnNextSave schedules pending password", async () => {
    mockRequestPassword.mockResolvedValue("new-pass");
    await protectDocumentOnNextSave();
    expect(mockRequestPassword).toHaveBeenCalledWith(
      expect.objectContaining({ confirm: true }),
    );
    expect(useDocumentStore.getState().pendingSavePassword).toBe("new-pass");
    expect(useDocumentStore.getState().isDirty).toBe(true);
  });

  it("protectDocumentOnNextSave does nothing when cancelled", async () => {
    mockRequestPassword.mockResolvedValue(null);
    await protectDocumentOnNextSave();
    expect(useDocumentStore.getState().pendingSavePassword).toBeNull();
  });

  it("removeDocumentPasswordProtection schedules removal", async () => {
    useDocumentStore.setState({
      isPasswordProtected: true,
      documentPassword: null,
      isDirty: false,
    });
    mockRequestPassword.mockResolvedValue("current");
    await removeDocumentPasswordProtection();
    expect(useDocumentStore.getState().removePasswordOnSave).toBe(true);
    expect(useDocumentStore.getState().documentPassword).toBe("current");
  });
});
