import { create } from "zustand";
import {
  applyEditSnapshot,
  captureEditSnapshot,
  snapshotsEqual,
  type EditHistorySnapshot,
} from "@/lib/history";

const MAX_HISTORY = 50;

interface HistoryStore {
  past: EditHistorySnapshot[];
  future: EditHistorySnapshot[];
  record: () => void;
  undo: () => Promise<boolean>;
  redo: () => Promise<boolean>;
  clear: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  past: [],
  future: [],

  record: () => {
    const snapshot = captureEditSnapshot();
    set((state) => {
      const last = state.past[state.past.length - 1];
      if (last && snapshotsEqual(last, snapshot)) {
        return state;
      }
      return {
        past: [...state.past.slice(-MAX_HISTORY + 1), snapshot],
        future: [],
      };
    });
  },

  undo: async () => {
    const { past } = get();
    if (past.length === 0) return false;
    const previous = past[past.length - 1];
    const current = captureEditSnapshot();
    set({
      past: past.slice(0, -1),
      future: [current, ...get().future],
    });
    await applyEditSnapshot(previous);
    return true;
  },

  redo: async () => {
    const { future } = get();
    if (future.length === 0) return false;
    const next = future[0];
    const current = captureEditSnapshot();
    set((state) => ({
      future: state.future.slice(1),
      past: [...state.past, current],
    }));
    await applyEditSnapshot(next);
    return true;
  },

  clear: () => set({ past: [], future: [] }),

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
}));

/** Push current edit state onto the undo stack before a mutating action. */
export function recordHistory(): void {
  useHistoryStore.getState().record();
}

export function clearHistory(): void {
  useHistoryStore.getState().clear();
}
