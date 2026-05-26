import type { AppErrorPayload } from "@shared/types";

export function normalizeInvokeError(err: unknown): AppErrorPayload | null {
  if (typeof err === "string") {
    try {
      const parsed = JSON.parse(err) as unknown;
      return normalizeInvokeError(parsed);
    } catch {
      return { errorId: crypto.randomUUID(), message: err };
    }
  }

  if (typeof err === "object" && err !== null) {
    const record = err as Record<string, unknown>;
    const errorId = record.errorId ?? record.error_id;
    const message = record.message;
    if (typeof errorId === "string" && typeof message === "string") {
      return {
        errorId,
        message,
        code: record.code ? String(record.code) : undefined,
      };
    }
  }

  return null;
}

export function errorMessage(err: unknown): string {
  const payload = normalizeInvokeError(err);
  if (payload) return payload.message;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}
