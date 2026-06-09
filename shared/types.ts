export type LogLevel = "debug" | "info" | "warn" | "error";

/** Logical area of the app — used for filtering and structured log files. */
export type LogCategory =
  | "app"
  | "document"
  | "pdf"
  | "annotation"
  | "form"
  | "content"
  | "security"
  | "assembly"
  | "ui"
  | "invoke"
  | "perf"
  | "system"
  | "update";

export interface LogContext {
  sessionId?: string;
  documentId?: string;
  userAction?: string;
  durationMs?: number;
  errorId?: string;
  category?: LogCategory;
  component?: string;
  correlationId?: string;
  /** Extra structured fields (serialized to JSON in file logs). */
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  sessionId: string;
  context?: LogContext;
}

export interface LoggingInfo {
  logDirectory: string;
  sessionId: string;
  minLevel: LogLevel;
  appVersion: string;
  platform: string;
}

export interface PdfMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  pageCount: number;
  fileSize: number;
  isPasswordProtected?: boolean;
}

export type ViewMode = "continuous" | "single" | "spread";
export type ZoomMode = "custom" | "fit-page" | "fit-width" | "actual";

export type AnnotationType =
  | "highlight"
  | "underline"
  | "strikeout"
  | "note"
  | "freehand"
  | "text"
  | "stamp"
  | "shape";

export type ShapeKind = "rectangle" | "ellipse" | "line" | "arrow";

export interface AnnotationBase {
  id: string;
  type: AnnotationType;
  pageIndex: number;
  createdAt: string;
  author: string;
  color: string;
}

export interface RectAnnotation extends AnnotationBase {
  type: "highlight" | "underline" | "strikeout";
  rects: Array<{ x: number; y: number; width: number; height: number }>;
}

export interface NoteAnnotation extends AnnotationBase {
  type: "note";
  x: number;
  y: number;
  content: string;
}

export interface FreehandAnnotation extends AnnotationBase {
  type: "freehand";
  points: Array<{ x: number; y: number }>;
  strokeWidth: number;
}

export interface TextAnnotation extends AnnotationBase {
  type: "text";
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  fontSize: number;
}

export type StampKind = "approved" | "draft" | "confidential" | "not-approved";

export interface StampAnnotation extends AnnotationBase {
  type: "stamp";
  x: number;
  y: number;
  stamp: StampKind;
  width?: number;
  height?: number;
}

export interface ShapeAnnotation extends AnnotationBase {
  type: "shape";
  shape: ShapeKind;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokeWidth: number;
}

export type Annotation =
  | RectAnnotation
  | NoteAnnotation
  | FreehandAnnotation
  | TextAnnotation
  | StampAnnotation
  | ShapeAnnotation;

export type NewAnnotation =
  | Omit<RectAnnotation, "id" | "createdAt">
  | Omit<NoteAnnotation, "id" | "createdAt">
  | Omit<FreehandAnnotation, "id" | "createdAt">
  | Omit<TextAnnotation, "id" | "createdAt">
  | Omit<StampAnnotation, "id" | "createdAt">
  | Omit<ShapeAnnotation, "id" | "createdAt">;

export type Tool =
  | "select"
  | "hand"
  | "highlight"
  | "underline"
  | "strikeout"
  | "note"
  | "freehand"
  | "text"
  | "stamp"
  | "rectangle"
  | "ellipse"
  | "line"
  | "arrow"
  | "edit-text"
  | "add-text-block"
  | "add-image"
  | "form-text"
  | "form-checkbox"
  | "form-dropdown";

export type AppMode = "markup" | "edit" | "forms" | "document";

export interface TextContentEdit {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  oldText?: string;
  newText: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  coverOld: boolean;
  /** Minimum width (PDF pts) to white-out the original text; never shrinks while editing. */
  coverWidth?: number;
  /** Minimum height (PDF pts) to white-out the original text; never shrinks while editing. */
  coverHeight?: number;
}

export interface ImageContentEdit {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  imageBase64: string;
  mimeType: string;
}

export type FormFieldKind = "text" | "checkbox" | "radio" | "dropdown" | "listbox";

export interface FormFieldValue {
  name: string;
  value: string;
  type: FormFieldKind;
  required?: boolean;
}

export interface FormFieldDefinition {
  id: string;
  pageIndex: number;
  name: string;
  kind: FormFieldKind;
  x: number;
  y: number;
  width: number;
  height: number;
  defaultValue?: string;
  required?: boolean;
  readOnly?: boolean;
  options?: string[];
}

export interface FormInfo {
  hasAcroform: boolean;
  hasXfa: boolean;
  fieldCount: number;
}

export type SidebarTab =
  | "pages"
  | "outline"
  | "recent"
  | "info"
  | "annotations"
  | "forms"
  | "document";

export interface OutlineItem {
  title: string;
  pageIndex: number;
  level: number;
  children: OutlineItem[];
}

export interface SearchMatch {
  pageIndex: number;
  matchIndex: number;
  text: string;
  source?: "document" | "annotation";
  annotationId?: string;
}

export interface HighlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AppErrorPayload {
  errorId: string;
  message: string;
  code?: string;
}

export interface RecentFileEntry {
  path: string;
  name: string;
  openedAt: string;
}

export interface ReadFileResult {
  dataBase64: string;
  path: string;
}

export interface PdfInfoResult {
  metadata: PdfMetadata;
}

export type UpdateStatus = "up_to_date" | "update_available" | "error";

export type UpdateDialogPhase =
  | "idle"
  | "checking"
  | "up_to_date"
  | "downloading"
  | "installing"
  | "error";
