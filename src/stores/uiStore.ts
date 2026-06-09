import { create } from "zustand";

import {

  loadToolbarOrder,

  saveToolbarOrder,

  type ToolbarItemId,

} from "@/lib/toolbarOrder";

import type {
  AppErrorPayload,
  AppMode,
  SearchMatch,
  UpdateDialogPhase,
} from "@shared/types";



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

  showLogViewer: boolean;

  showSplitDialog: boolean;

  showHelpGuide: boolean;

  helpSectionId: string;

  toolbarOrder: ToolbarItemId[];

  toolbarDragFrom: ToolbarItemId | null;

  toolbarDropBeforeId: ToolbarItemId | null;

  showUpdateDialog: boolean;

  updatePhase: UpdateDialogPhase;

  updateMessage: string;

  setAppMode: (mode: AppMode) => void;

  toggleLogViewer: () => void;

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

  openSplitDialog: () => void;

  closeSplitDialog: () => void;

  openHelpGuide: (sectionId?: string) => void;

  closeHelpGuide: () => void;

  openUpdateDialog: () => void;

  closeUpdateDialog: () => void;

  setUpdateDialog: (state: { phase: UpdateDialogPhase; message: string }) => void;

  setToolbarOrder: (order: ToolbarItemId[]) => void;

  setToolbarDragState: (state: {

    dragFrom?: ToolbarItemId | null;

    dropBeforeId?: ToolbarItemId | null;

  }) => void;

}



export const useUiStore = create<UiStore>((set) => ({

  appMode: "document",

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

  showLogViewer: false,

  showSplitDialog: false,

  showHelpGuide: false,

  helpSectionId: "overview",

  toolbarOrder: loadToolbarOrder(),

  toolbarDragFrom: null,

  toolbarDropBeforeId: null,

  showUpdateDialog: false,

  updatePhase: "idle",

  updateMessage: "",

  setAppMode: (appMode) => set({ appMode }),

  toggleLogViewer: () => set((s) => ({ showLogViewer: !s.showLogViewer })),

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

  openSplitDialog: () => set({ showSplitDialog: true }),

  closeSplitDialog: () => set({ showSplitDialog: false }),

  openHelpGuide: (sectionId = "overview") =>

    set({ showHelpGuide: true, helpSectionId: sectionId }),

  closeHelpGuide: () => set({ showHelpGuide: false }),

  openUpdateDialog: () =>
    set({
      showUpdateDialog: true,
      updatePhase: "checking",
      updateMessage: "Checking GitHub for the latest build…",
    }),

  closeUpdateDialog: () =>
    set({
      showUpdateDialog: false,
      updatePhase: "idle",
      updateMessage: "",
    }),

  setUpdateDialog: ({ phase, message }) =>
    set({ updatePhase: phase, updateMessage: message, showUpdateDialog: true }),

  setToolbarOrder: (toolbarOrder) => {

    saveToolbarOrder(toolbarOrder);

    set({ toolbarOrder });

  },

  setToolbarDragState: (state) =>

    set((current) => ({

      toolbarDragFrom:

        "dragFrom" in state ? (state.dragFrom ?? null) : current.toolbarDragFrom,

      toolbarDropBeforeId:

        "dropBeforeId" in state

          ? (state.dropBeforeId ?? null)

          : current.toolbarDropBeforeId,

    })),

}));


