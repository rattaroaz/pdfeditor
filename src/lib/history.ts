import type {
  Annotation,
  FormFieldDefinition,
  FormFieldValue,
  ImageContentEdit,
  TextContentEdit,
} from "@shared/types";
import { useAnnotationStore } from "@/stores/annotationStore";
import { useContentEditStore } from "@/stores/contentEditStore";
import { useFormStore } from "@/stores/formStore";

export interface EditHistorySnapshot {
  annotations: Annotation[];
  textEdits: TextContentEdit[];
  imageEdits: ImageContentEdit[];
  formValues: Record<string, FormFieldValue>;
  newFields: FormFieldDefinition[];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function captureEditSnapshot(): EditHistorySnapshot {
  const ann = useAnnotationStore.getState();
  const content = useContentEditStore.getState();
  const form = useFormStore.getState();
  return {
    annotations: clone(ann.annotations),
    textEdits: clone(content.textEdits),
    imageEdits: clone(content.imageEdits),
    formValues: clone(form.values),
    newFields: clone(form.newFields),
  };
}

export function applyEditSnapshot(snapshot: EditHistorySnapshot): void {
  useAnnotationStore.setState({
    annotations: clone(snapshot.annotations),
    selectedId: null,
  });
  useContentEditStore.setState({
    textEdits: clone(snapshot.textEdits),
    imageEdits: clone(snapshot.imageEdits),
  });
  useFormStore.setState({
    values: clone(snapshot.formValues),
    newFields: clone(snapshot.newFields),
    activeFieldName: null,
    validationErrors: {},
  });
}

export function snapshotsEqual(a: EditHistorySnapshot, b: EditHistorySnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
