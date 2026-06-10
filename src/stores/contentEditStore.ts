import { create } from "zustand";
import type { ImageContentEdit, TextContentEdit } from "@shared/types";
import { log } from "@/lib/logging";
import {
  computeTextEditBox,
  coverLayoutMinimums,
} from "@/lib/textEditBox";
import { recordHistory } from "@/stores/historyStore";
import { useDocumentStore } from "@/stores/documentStore";
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
  /** Live typing sync — no undo history; keeps save/Standard view in sync. */
  updateTextEditContent: (id: string, newText: string) => void;
  /** Live resize while typing — does not push undo history. */
  updateTextEditLayout: (
    id: string,
    patch: Pick<TextContentEdit, "width" | "height">,
  ) => void;
  addImageEdit: (edit: Omit<ImageContentEdit, "id">) => string;
  removeTextEdit: (id: string) => void;
  removeImageEdit: (id: string) => void;
  updateTextEditPosition: (id: string, x: number, y: number) => void;
  updateImageEditPosition: (id: string, x: number, y: number) => void;
  updateImageEditSize: (id: string, width: number, height: number) => void;
  clearEdits: () => void;
  /** Commit in-progress text boxes before save (trim, drop empty, fix layout). */
  finalizeTextEdits: () => void;
  setReflowWarnings: (warnings: string[]) => void;
  hasEdits: () => boolean;
}

export const useContentEditStore = create<ContentEditStore>((set, get) => ({
  textEdits: [],
  imageEdits: [],
  reflowWarnings: [],

  addTextEdit: (partial) => {
    recordHistory();
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
    log.content.info("Text content edit added", {
      userAction: "add_text_edit",
      metadata: { pageIndex: partial.pageIndex, charCount: partial.newText.length },
    });
    return id;
  },

  updateTextEdit: (id, patch) => {
    recordHistory();
    set((s) => ({
      textEdits: s.textEdits.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
  },

  updateTextEditContent: (id, newText) =>
    set((s) => ({
      textEdits: s.textEdits.map((e) => (e.id === id ? { ...e, newText } : e)),
    })),

  updateTextEditLayout: (id, patch) =>
    set((s) => ({
      textEdits: s.textEdits.map((e) => {
        if (e.id !== id) return e;
        if (
          Math.abs(e.width - patch.width) < 0.01 &&
          Math.abs(e.height - patch.height) < 0.01
        ) {
          return e;
        }
        return { ...e, ...patch };
      }),
    })),

  addImageEdit: (partial) => {
    recordHistory();
    const id = uuidv4();
    set((s) => ({
      imageEdits: [...s.imageEdits, { ...partial, id }],
    }));
    log.content.info("Image content edit added", {
      userAction: "add_image_edit",
      metadata: { pageIndex: partial.pageIndex, mimeType: partial.mimeType },
    });
    return id;
  },

  removeTextEdit: (id) => {
    recordHistory();
    set((s) => ({ textEdits: s.textEdits.filter((e) => e.id !== id) }));
    log.content.info("Text content edit removed", { userAction: "remove_text_edit", metadata: { id } });
  },

  removeImageEdit: (id) => {
    recordHistory();
    set((s) => ({ imageEdits: s.imageEdits.filter((e) => e.id !== id) }));
    log.content.info("Image content edit removed", { userAction: "remove_image_edit", metadata: { id } });
  },

  updateTextEditPosition: (id, x, y) =>
    set((s) => ({
      textEdits: s.textEdits.map((e) => (e.id === id ? { ...e, x, y } : e)),
    })),

  updateImageEditPosition: (id, x, y) =>
    set((s) => ({
      imageEdits: s.imageEdits.map((e) => (e.id === id ? { ...e, x, y } : e)),
    })),

  updateImageEditSize: (id, width, height) =>
    set((s) => ({
      imageEdits: s.imageEdits.map((e) => (e.id === id ? { ...e, width, height } : e)),
    })),

  clearEdits: () => set({ textEdits: [], imageEdits: [], reflowWarnings: [] }),

  finalizeTextEdits: () => {
    let changed = false;
    set((s) => {
      const textEdits = s.textEdits.flatMap((existing) => {
        const trimmed = existing.newText.trim();
        if (!trimmed && !existing.coverOld) {
          changed = true;
          return [];
        }
        if (!trimmed) {
          return [existing];
        }
        const { minWidth, minHeight } = coverLayoutMinimums(existing, trimmed);
        const box = computeTextEditBox(trimmed, existing.fontSize, {
          coverOld: existing.coverOld,
          minWidth,
          minHeight: existing.coverOld
            ? minHeight
            : Math.max(minHeight ?? 0, existing.height),
        });
        const next = {
          ...existing,
          newText: trimmed,
          width: existing.coverOld
            ? Math.max(existing.coverWidth ?? 0, box.width)
            : box.width,
          height: box.height,
        };
        if (
          next.newText !== existing.newText ||
          next.width !== existing.width ||
          next.height !== existing.height
        ) {
          changed = true;
        }
        return [next];
      });
      return { textEdits };
    });
    if (changed && get().hasEdits()) {
      useDocumentStore.getState().setDirty(true);
    }
  },

  setReflowWarnings: (reflowWarnings) => set({ reflowWarnings }),

  hasEdits: () => {
    const { textEdits, imageEdits } = get();
    return (
      imageEdits.length > 0 ||
      textEdits.some((e) => e.coverOld || e.newText.trim().length > 0)
    );
  },
}));
