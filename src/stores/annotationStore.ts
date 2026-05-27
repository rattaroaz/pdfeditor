import { create } from "zustand";
import type { Annotation, NewAnnotation, StampKind, Tool } from "@shared/types";
import { recordHistory } from "@/stores/historyStore";
import { v4 as uuidv4 } from "uuid";

interface AnnotationStore {
  annotations: Annotation[];
  activeTool: Tool;
  activeStamp: StampKind;
  selectedId: string | null;
  setActiveTool: (tool: Tool) => void;
  setActiveStamp: (stamp: StampKind) => void;
  selectAnnotation: (id: string | null) => void;
  setAnnotations: (annotations: Annotation[]) => void;
  addAnnotation: (annotation: NewAnnotation) => void;
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  removeAnnotation: (id: string) => void;
  clearAnnotations: () => void;
  getPageAnnotations: (pageIndex: number) => Annotation[];
}

export const useAnnotationStore = create<AnnotationStore>((set, get) => ({
  annotations: [],
  activeTool: "select",
  activeStamp: "approved",
  selectedId: null,

  setActiveTool: (activeTool) => set({ activeTool, selectedId: null }),
  setActiveStamp: (activeStamp) => set({ activeStamp }),
  selectAnnotation: (selectedId) => set({ selectedId }),
  setAnnotations: (annotations) => set({ annotations, selectedId: null }),
  addAnnotation: (partial) => {
    recordHistory();
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
    recordHistory();
    set((state) => ({
      annotations: state.annotations.map((a) =>
        a.id === id ? ({ ...a, ...patch } as Annotation) : a,
      ),
    }));
  },
  removeAnnotation: (id) => {
    recordHistory();
    set((state) => ({
      annotations: state.annotations.filter((a) => a.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    }));
  },
  clearAnnotations: () => set({ annotations: [], selectedId: null }),
  getPageAnnotations: (pageIndex) =>
    get().annotations.filter((a) => a.pageIndex === pageIndex),
}));
