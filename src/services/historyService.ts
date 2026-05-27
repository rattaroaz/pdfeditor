import { persistAnnotations } from "@/services/documentService";
import { log } from "@/lib/logging";
import { useDocumentStore } from "@/stores/documentStore";
import { useHistoryStore } from "@/stores/historyStore";

export function undoEdit(): void {
  const history = useHistoryStore.getState();
  if (!history.undo()) return;
  log.ui.info("Undo", {
    userAction: "undo",
    metadata: { canRedo: history.canRedo() },
  });
  useDocumentStore.getState().setDirty(true);
  void persistAnnotations();
}

export function redoEdit(): void {
  const history = useHistoryStore.getState();
  if (!history.redo()) return;
  log.ui.info("Redo", {
    userAction: "redo",
    metadata: { canUndo: history.canUndo() },
  });
  useDocumentStore.getState().setDirty(true);
  void persistAnnotations();
}
