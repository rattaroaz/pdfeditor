import type { LogContext } from "@shared/types";
import { useDocumentStore } from "@/stores/documentStore";

const SENSITIVE_KEY = /password|passwd|secret|token|authorization/i;

function redactMetadata(
  metadata?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!metadata) return metadata;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    next[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : value;
  }
  return next;
}

/** Merge store state and base context for every log line. */
export function enrichLogContext(context?: LogContext): LogContext {
  let documentId = context?.documentId;
  let fileName: string | undefined;

  try {
    const doc = useDocumentStore.getState();
    documentId = documentId ?? doc.documentId ?? undefined;
    fileName = doc.fileName !== "Untitled" ? doc.fileName : undefined;
  } catch {
    // Store unavailable during tests or early boot
  }

  const metadata: Record<string, unknown> = {
    ...redactMetadata(context?.metadata),
  };
  if (fileName) metadata.fileName = fileName;

  return {
    ...context,
    documentId,
    metadata: Object.keys(metadata).length > 0 ? metadata : context?.metadata,
  };
}
