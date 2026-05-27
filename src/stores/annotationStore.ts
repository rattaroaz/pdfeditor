import { create } from "zustand";
import type { Annotation, NewAnnotation, StampKind, Tool } from "@shared/types";
import { log } from "@/lib/logging";
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

  setActiveTool: (activeTool) => {
    log.annotation.debug("Annotation tool selected", {
      userAction: "select_tool",
      metadata: { tool: activeTool },
    });
    set({ activeTool, selectedId: null });
  },
  setActiveStamp: (activeStamp) => set({ activeStamp }),
  selectAnnotation: (selectedId) => set({ selectedId }),
  setAnnotations: (annotations) => set({ annotations, selectedId: null }),
  addAnnotation: (partial) => {
    recordHistory();
    log.annotation.info("Annotation added", {
      userAction: "add_annotation",
      metadata: { type: partial.type, pageIndex: partial.pageIndex },
    });
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
    log.annotation.info("Annotation removed", {
      userAction: "remove_annotation",
      metadata: { id },
    });
    set((state) => ({
      annotations: state.annotations.filter((a) => a.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    }));
  },
  clearAnnotations: () => set({ annotations: [], selectedId: null }),
  getPageAnnotations: (pageIndex) =>
    get().annotations.filter((a) => a.pageIndex === pageIndex),
}));
