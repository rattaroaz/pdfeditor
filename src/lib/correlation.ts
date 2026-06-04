import { v4 as uuidv4 } from "uuid";

/** Trace id for a single user operation (invoke chain, save flow, etc.). */
export function createCorrelationId(): string {
  return uuidv4();
}
