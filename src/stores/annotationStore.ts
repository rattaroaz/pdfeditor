import { create } from "zustand";
import type { Annotation, NewAnnotation, StampKind, Tool } from "@shared/types";
import { v4 as uuidv4 } from "uuid";

const MAX_HISTORY = 50;

function cloneAnnotations(annotations: Annotation[]): Annotation[] {
  return JSON.parse(JSON.stringify(annotations)) as Annotation[];
}

interface AnnotationStore {
  annotations: Annotation[];
  past: Annotation[][];
  future: Annotation[][];
  activeTool: Tool;
  activeStamp: StampKind;
  selectedId: string | null;
  setActiveTool: (tool: Tool) => void;
  setActiveStamp: (stamp: StampKind) => void;
  selectAnnotation: (id: string | null) => void;
  setAnnotations: (annotations: Annotation[]) => void;
  pushHistory: () => void;
  addAnnotation: (annotation: NewAnnotation) => void;
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  removeAnnotation: (id: string) => void;
  clearAnnotations: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  getPageAnnotations: (pageIndex: number) => Annotation[];
}

export const useAnnotationStore = create<AnnotationStore>((set, get) => ({
  annotations: [],
  past: [],
  future: [],
  activeTool: "select",
  activeStamp: "approved",
  selectedId: null,

  setActiveTool: (activeTool) => set({ activeTool, selectedId: null }),
  setActiveStamp: (activeStamp) => set({ activeStamp }),
  selectAnnotation: (selectedId) => set({ selectedId }),
  setAnnotations: (annotations) => set({ annotations, past: [], future: [] }),
  pushHistory: () =>
    set((state) => ({
      past: [...state.past.slice(-MAX_HISTORY + 1), cloneAnnotations(state.annotations)],
      future: [],
    })),
  addAnnotation: (partial) => {
    get().pushHistory();
    set((state) => ({
      annotations: [
        ...state.annotations,
        {
          ...partial,
          id: uuidv4(),
          createdAt: new Date().toISOString(),
        } as Annotation,
      ],
    }));
  },
  updateAnnotation: (id, patch) => {
    get().pushHistory();
    set((state) => ({
      annotations: state.annotations.map((a) =>
        a.id === id ? ({ ...a, ...patch } as Annotation) : a,
      ),
    }));
  },
  removeAnnotation: (id) => {
    get().pushHistory();
    set((state) => ({
      annotations: state.annotations.filter((a) => a.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    }));
  },
  clearAnnotations: () => set({ annotations: [], past: [], future: [], selectedId: null }),
  undo: () => {
    const { past, annotations, future } = get();
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    set({
      past: past.slice(0, -1),
      future: [cloneAnnotations(annotations), ...future],
      annotations: previous,
      selectedId: null,
    });
  },
  redo: () => {
    const { future, annotations, past } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      future: future.slice(1),
      past: [...past, cloneAnnotations(annotations)],
      annotations: next,
      selectedId: null,
    });
  },
  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
  getPageAnnotations: (pageIndex) =>
    get().annotations.filter((a) => a.pageIndex === pageIndex),
}));
