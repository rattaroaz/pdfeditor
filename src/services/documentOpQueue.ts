import { log, recordMetric } from "@/lib/logging";
import { errorMessage } from "@/lib/parseInvokeError";

/**
 * Serializes document byte mutations (open/save/page/form/content/assembly).
 * Nested calls from inside an already-running operation run inline to avoid deadlock
 * (e.g. save → applyContentEdits).
 */
let documentOperationQueue: Promise<unknown> = Promise.resolve();
let documentOperationDepth = 0;

export function runDocumentOperation<T>(
  operation: string,
  task: () => Promise<T>,
): Promise<T> {
  if (documentOperationDepth > 0) {
    return task();
  }

  const run = documentOperationQueue.then(
    () => runWithDepth(operation, task),
    () => runWithDepth(operation, task),
  );
  documentOperationQueue = run.catch((err) => {
    log.document.warn("Document operation failed", {
      userAction: operation,
      metadata: { error: errorMessage(err) },
    });
  });
  return run;
}

async function runWithDepth<T>(operation: string, task: () => Promise<T>): Promise<T> {
  documentOperationDepth += 1;
  const start = performance.now();
  try {
    const result = await task();
    recordMetric({
      name: `document.${operation}`,
      durationMs: Math.round(performance.now() - start),
      outcome: "ok",
      category: "document",
    });
    return result;
  } catch (err) {
    recordMetric({
      name: `document.${operation}`,
      durationMs: Math.round(performance.now() - start),
      outcome: "fail",
      category: "document",
    });
    throw err;
  } finally {
    documentOperationDepth -= 1;
  }
}

/** Test-only: reset queue between cases. */
export function __resetDocumentOperationQueueForTests(): void {
  documentOperationQueue = Promise.resolve();
  documentOperationDepth = 0;
}
