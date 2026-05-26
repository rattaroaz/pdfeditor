import { create } from "zustand";
import type { AppErrorPayload, AppMode, SearchMatch } from "@shared/types";

interface UiStore {
  appMode: AppMode;
  searchQuery: string;
  searchMatches: SearchMatch[];
  activeMatchIndex: number;
  caseSensitive: boolean;
  wholeWord: boolean;
  searchAnnotations: boolean;
  flattenOnSave: boolean;
  showSearch: boolean;
  lastError: AppErrorPayload | null;
  showErrorDialog: boolean;
  setAppMode: (mode: AppMode) => void;
  setSearchQuery: (query: string) => void;
  setSearchMatches: (matches: SearchMatch[]) => void;
  setActiveMatchIndex: (index: number) => void;
  setCaseSensitive: (value: boolean) => void;
  setWholeWord: (value: boolean) => void;
  setSearchAnnotations: (value: boolean) => void;
  setFlattenOnSave: (value: boolean) => void;
  toggleSearch: () => void;
  showError: (error: AppErrorPayload) => void;
  dismissError: () => void;
}

export const useUiStore = create<UiStore>((set) => ({
  appMode: "markup",
  searchQuery: "",
  searchMatches: [],
  activeMatchIndex: 0,
  caseSensitive: false,
  wholeWord: false,
  searchAnnotations: false,
  flattenOnSave: false,
  showSearch: false,
  lastError: null,
  showErrorDialog: false,

  setAppMode: (appMode) => set({ appMode }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSearchMatches: (searchMatches) =>
    set({ searchMatches, activeMatchIndex: 0 }),
  setActiveMatchIndex: (activeMatchIndex) => set({ activeMatchIndex }),
  setCaseSensitive: (caseSensitive) => set({ caseSensitive }),
  setWholeWord: (wholeWord) => set({ wholeWord }),
  setSearchAnnotations: (searchAnnotations) => set({ searchAnnotations }),
  setFlattenOnSave: (flattenOnSave) => set({ flattenOnSave }),
  toggleSearch: () => set((s) => ({ showSearch: !s.showSearch })),
  showError: (lastError) => set({ lastError, showErrorDialog: true }),
  dismissError: () => set({ showErrorDialog: false }),
}));
