import type { LogContext } from "@shared/types";
import { useDocumentStore } from "@/stores/documentStore";

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
    ...context?.metadata,
  };
  if (fileName) metadata.fileName = fileName;

  return {
    ...context,
    documentId,
    metadata: Object.keys(metadata).length > 0 ? metadata : context?.metadata,
  };
}
