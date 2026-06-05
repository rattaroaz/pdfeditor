import type { Annotation } from "@shared/types";
import { annotationCenter } from "@/lib/annotationBounds";
import { findFormWidgetByName } from "@/lib/pdf/pdfEngine";
import { useAnnotationStore } from "@/stores/annotationStore";
import { useDocumentStore } from "@/stores/documentStore";
import { useFormStore } from "@/stores/formStore";
import { useUiStore } from "@/stores/uiStore";

export function navigateToPagePoint(pageNumber: number, pdfX: number, pdfY: number): void {
  useDocumentStore.getState().requestScrollToTarget({ pageNumber, pdfX, pdfY });
}

export function navigateToAnnotation(ann: Annotation): void {
  if (useUiStore.getState().appMode === "markup") {
    useAnnotationStore.getState().setActiveTool("select");
  }
  useAnnotationStore.getState().selectAnnotation(ann.id);
  const center = annotationCenter(ann);
  navigateToPagePoint(ann.pageIndex + 1, center.x, center.y);
}

export async function navigateToFormField(fieldName: string): Promise<void> {
  useUiStore.getState().setAppMode("forms");
  useDocumentStore.getState().setSidebarTab("forms");
  useAnnotationStore.getState().setActiveTool("select");
  useFormStore.getState().setActiveField(fieldName);

  const newField = useFormStore.getState().newFields.find((f) => f.name === fieldName);
  if (newField) {
    navigateToPagePoint(
      newField.pageIndex + 1,
      newField.x + newField.width / 2,
      newField.y + newField.height / 2,
    );
    return;
  }

  const pdfDoc = useDocumentStore.getState().pdfDoc;
  if (!pdfDoc) return;

  const widget = await findFormWidgetByName(pdfDoc, fieldName, useDocumentStore.getState().rotation);
  if (!widget) return;

  navigateToPagePoint(
    widget.pageIndex + 1,
    widget.x + widget.width / 2,
    widget.y + widget.height / 2,
  );
}
