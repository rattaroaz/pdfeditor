import { v4 as uuidv4 } from "uuid";

/** Trace id for a single user operation (invoke chain, save flow, etc.). */
export function createCorrelationId(): string {
  return uuidv4();
}

let activeCorrelationId: string | undefined;

/** Current correlation for nested invokeLogged calls (e.g. inside save). */
export function getActiveCorrelationId(): string | undefined {
  return activeCorrelationId;
}

/** Run an async task with a correlation id visible to nested invokes. */
export async function runWithCorrelationId<T>(
  correlationId: string,
  task: () => Promise<T>,
): Promise<T> {
  const previous = activeCorrelationId;
  activeCorrelationId = correlationId;
  try {
    return await task();
  } finally {
    activeCorrelationId = previous;
  }
}
