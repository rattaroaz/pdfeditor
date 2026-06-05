import { persistAnnotations } from "@/services/documentService";
import { log } from "@/lib/logging";
import { useDocumentStore } from "@/stores/documentStore";
import { useHistoryStore } from "@/stores/historyStore";

export async function undoEdit(): Promise<void> {
  const history = useHistoryStore.getState();
  if (!(await history.undo())) return;
  log.ui.info("Undo", {
    userAction: "undo",
    metadata: { canRedo: history.canRedo() },
  });
  useDocumentStore.getState().setDirty(true);
  void persistAnnotations();
}

export async function redoEdit(): Promise<void> {
  const history = useHistoryStore.getState();
  if (!(await history.redo())) return;
  log.ui.info("Redo", {
    userAction: "redo",
    metadata: { canUndo: history.canUndo() },
  });
  useDocumentStore.getState().setDirty(true);
  void persistAnnotations();
}
