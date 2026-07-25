import { persistAnnotations } from "@/services/documentService";
import { runDocumentOperation } from "@/services/documentOpQueue";
import { log } from "@/lib/logging";
import { useDocumentStore } from "@/stores/documentStore";
import { useHistoryStore } from "@/stores/historyStore";

export async function undoEdit(): Promise<void> {
  return runDocumentOperation("undo", async () => {
    const history = useHistoryStore.getState();
    if (!(await history.undo())) return;
    log.ui.info("Undo", {
      userAction: "undo",
      metadata: { canRedo: history.canRedo() },
    });
    useDocumentStore.getState().markDocumentChanged("history");
    void persistAnnotations();
  });
}

export async function redoEdit(): Promise<void> {
  return runDocumentOperation("redo", async () => {
    const history = useHistoryStore.getState();
    if (!(await history.redo())) return;
    log.ui.info("Redo", {
      userAction: "redo",
      metadata: { canUndo: history.canUndo() },
    });
    useDocumentStore.getState().markDocumentChanged("history");
    void persistAnnotations();
  });
}
