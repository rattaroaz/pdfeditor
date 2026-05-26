import { create } from "zustand";
import type { ImageContentEdit, TextContentEdit } from "@shared/types";
import { v4 as uuidv4 } from "uuid";

interface ContentEditStore {
  textEdits: TextContentEdit[];
  imageEdits: ImageContentEdit[];
  reflowWarnings: string[];
  addTextEdit: (edit: Omit<TextContentEdit, "id">) => string;
  updateTextEdit: (
    id: string,
    patch: Partial<Pick<TextContentEdit, "newText" | "width" | "height">>,
  ) => void;
  addImageEdit: (edit: Omit<ImageContentEdit, "id">) => void;
  removeTextEdit: (id: string) => void;
  removeImageEdit: (id: string) => void;
  updateTextEditPosition: (id: string, x: number, y: number) => void;
  updateImageEditPosition: (id: string, x: number, y: number) => void;
  clearEdits: () => void;
  setReflowWarnings: (warnings: string[]) => void;
  hasEdits: () => boolean;
}

export const useContentEditStore = create<ContentEditStore>((set, get) => ({
  textEdits: [],
  imageEdits: [],
  reflowWarnings: [],

  addTextEdit: (partial) => {
    const id = uuidv4();
    const warnings: string[] = [];
    if (partial.oldText && partial.newText.length > partial.oldText.length * 1.5) {
      warnings.push(
        `Text on page ${partial.pageIndex + 1} may overflow its original area.`,
      );
    }
    set((s) => ({
      textEdits: [...s.textEdits, { ...partial, id }],
      reflowWarnings: [...s.reflowWarnings, ...warnings],
    }));
    return id;
  },

  updateTextEdit: (id, patch) =>
    set((s) => ({
      textEdits: s.textEdits.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    })),

  addImageEdit: (partial) =>
    set((s) => ({
      imageEdits: [...s.imageEdits, { ...partial, id: uuidv4() }],
    })),

  removeTextEdit: (id) =>
    set((s) => ({ textEdits: s.textEdits.filter((e) => e.id !== id) })),

  removeImageEdit: (id) =>
    set((s) => ({ imageEdits: s.imageEdits.filter((e) => e.id !== id) })),

  updateTextEditPosition: (id, x, y) =>
    set((s) => ({
      textEdits: s.textEdits.map((e) => (e.id === id ? { ...e, x, y } : e)),
    })),

  updateImageEditPosition: (id, x, y) =>
    set((s) => ({
      imageEdits: s.imageEdits.map((e) => (e.id === id ? { ...e, x, y } : e)),
    })),

  clearEdits: () => set({ textEdits: [], imageEdits: [], reflowWarnings: [] }),

  setReflowWarnings: (reflowWarnings) => set({ reflowWarnings }),

  hasEdits: () => get().textEdits.length > 0 || get().imageEdits.length > 0,
}));
