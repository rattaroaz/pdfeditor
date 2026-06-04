import { handleInvoke } from "./invokeHandlers";

export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return handleInvoke<T>(command, args);
}

export function isTauri(): boolean {
  return true;
}

export function convertFileSrc(filePath: string): string {
  return filePath;
}
