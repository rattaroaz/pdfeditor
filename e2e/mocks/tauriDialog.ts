import { E2E_PDF_PATH } from "./fixturePdf";

export async function open(options?: { multiple?: boolean }): Promise<string | string[] | null> {
  if (options?.multiple) return [E2E_PDF_PATH];
  return E2E_PDF_PATH;
}

export async function save(options?: { defaultPath?: string }): Promise<string | null> {
  return options?.defaultPath ?? E2E_PDF_PATH;
}

export async function ask(): Promise<boolean> {
  return true;
}

export async function confirm(): Promise<boolean> {
  return true;
}

export async function message(): Promise<void> {
  // noop
}
