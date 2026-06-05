import type {
  Annotation,
  FormFieldDefinition,
  FormFieldValue,
  ImageContentEdit,
  TextContentEdit,
} from "@shared/types";
import { encodeBase64Pdf, decodeBase64Pdf } from "@/lib/pdf/pdfBinary";
import { useAnnotationStore } from "@/stores/annotationStore";
import { useContentEditStore } from "@/stores/contentEditStore";
import { useDocumentStore, type PageRotation } from "@/stores/documentStore";
import { useFormStore } from "@/stores/formStore";

export interface DocumentHistorySnapshot {
  pdfBytesBase64: string;
  currentPage: number;
  rotation: PageRotation;
  pageCount: number;
}

export interface EditHistorySnapshot {
  annotations: Annotation[];
  textEdits: TextContentEdit[];
  imageEdits: ImageContentEdit[];
  formValues: Record<string, FormFieldValue>;
  newFields: FormFieldDefinition[];
  document: DocumentHistorySnapshot | null;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function captureEditSnapshot(): EditHistorySnapshot {
  const ann = useAnnotationStore.getState();
  const content = useContentEditStore.getState();
  const form = useFormStore.getState();
  const doc = useDocumentStore.getState();
  const bytes = doc.basePdfBytes ?? doc.pdfBytes;
  const document =
    bytes && doc.metadata
      ? {
          pdfBytesBase64: encodeBase64Pdf(bytes),
          currentPage: doc.currentPage,
          rotation: doc.rotation,
          pageCount: doc.metadata.pageCount,
        }
      : null;

  return {
    annotations: clone(ann.annotations),
    textEdits: clone(content.textEdits),
    imageEdits: clone(content.imageEdits),
    formValues: clone(form.values),
    newFields: clone(form.newFields),
    document,
  };
}

export async function applyEditSnapshot(snapshot: EditHistorySnapshot): Promise<void> {
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

  if (!snapshot.document) return;

  const { loadPdfFromBytes } = await import("@/lib/pdf/pdfEngine");
  const bytes = decodeBase64Pdf(snapshot.document.pdfBytesBase64);
  const password = useDocumentStore.getState().documentPassword ?? undefined;
  const pdfDoc = await loadPdfFromBytes(bytes, password);
  useDocumentStore.getState().applyPdfStructureChange({
    pdfDoc,
    pdfBytes: bytes,
    pageCount: snapshot.document.pageCount,
  });
  const currentPage = Math.min(
    Math.max(1, snapshot.document.currentPage),
    snapshot.document.pageCount,
  );
  useDocumentStore.setState({
    currentPage,
    scrollToPage: currentPage,
    rotation: snapshot.document.rotation,
  });
}

export function snapshotsEqual(a: EditHistorySnapshot, b: EditHistorySnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
