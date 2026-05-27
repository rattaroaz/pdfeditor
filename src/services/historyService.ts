import { persistAnnotations } from "@/services/documentService";
import { useDocumentStore } from "@/stores/documentStore";
import { useHistoryStore } from "@/stores/historyStore";

export function undoEdit(): void {
  if (!useHistoryStore.getState().undo()) return;
  useDocumentStore.getState().setDirty(true);
  void persistAnnotations();
}

export function redoEdit(): void {
  if (!useHistoryStore.getState().redo()) return;
  useDocumentStore.getState().setDirty(true);
  void persistAnnotations();
}
