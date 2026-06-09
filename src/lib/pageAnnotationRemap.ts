import { rotateAnnotationForPage, rotateViewportRect } from "@/lib/pdf/viewportCoords";
import type {
  Annotation,
  FormFieldDefinition,
  ImageContentEdit,
  TextContentEdit,
} from "@shared/types";

type PageIndexed = { pageIndex: number };

function remapAfterDelete<T extends PageIndexed>(
  items: T[],
  deletedPageNumbers: number[],
): T[] {
  const deletedZeroBased = new Set(deletedPageNumbers.map((p) => p - 1));

  return items
    .filter((item) => !deletedZeroBased.has(item.pageIndex))
    .map((item) => {
      const shift = deletedPageNumbers.filter((p) => p - 1 < item.pageIndex).length;
      return { ...item, pageIndex: item.pageIndex - shift };
    });
}

function remapAfterReorder<T extends PageIndexed>(
  items: T[],
  newOrder: number[],
): T[] {
  return items.map((item) => {
    const newIndex = newOrder.indexOf(item.pageIndex + 1);
    return newIndex >= 0 ? { ...item, pageIndex: newIndex } : item;
  });
}

function remapAfterInsert<T extends PageIndexed>(
  items: T[],
  afterPage: number,
  insertCount: number,
): T[] {
  return items.map((item) =>
    item.pageIndex >= afterPage
      ? { ...item, pageIndex: item.pageIndex + insertCount }
      : item,
  );
}

/** Remap annotation page indices after deleting 1-indexed page numbers. */
export function remapAnnotationsAfterDelete(
  annotations: Annotation[],
  deletedPageNumbers: number[],
): Annotation[] {
  return remapAfterDelete(annotations, deletedPageNumbers);
}

/** Remap annotation page indices after reorder. newOrder is 1-indexed page numbers in new positions. */
export function remapAnnotationsAfterReorder(
  annotations: Annotation[],
  newOrder: number[],
): Annotation[] {
  return remapAfterReorder(annotations, newOrder);
}

export function remapPageIndexedAfterDelete<T extends PageIndexed>(
  items: T[],
  deletedPageNumbers: number[],
): T[] {
  return remapAfterDelete(items, deletedPageNumbers);
}

export function remapPageIndexedAfterReorder<T extends PageIndexed>(
  items: T[],
  newOrder: number[],
): T[] {
  return remapAfterReorder(items, newOrder);
}

export function remapPageIndexedAfterInsert<T extends PageIndexed>(
  items: T[],
  afterPage: number,
  insertCount: number,
): T[] {
  return remapAfterInsert(items, afterPage, insertCount);
}

export function remapAnnotationsAfterInsert(
  annotations: Annotation[],
  afterPage: number,
  insertCount: number,
): Annotation[] {
  return remapAfterInsert(annotations, afterPage, insertCount);
}

/** Compute new 1-indexed order after moving one page from fromIndex to toIndex (0-based). */
export function reorderPageNumbers(
  pageCount: number,
  fromIndex: number,
  toIndex: number,
): number[] {
  const order = Array.from({ length: pageCount }, (_, i) => i + 1);
  const [moved] = order.splice(fromIndex, 1);
  order.splice(toIndex, 0, moved);
  return order;
}

type PageSize = { width: number; height: number };

function rotatePageIndexedItem<T extends PageIndexed & { x: number; y: number; width: number; height: number }>(
  item: T,
  rotatedPages: Map<number, PageSize>,
  rotateRect: (
    x: number,
    y: number,
    width: number,
    height: number,
    pageWidth: number,
    pageHeight: number,
  ) => { x: number; y: number; width: number; height: number },
): T {
  const pageNumber = item.pageIndex + 1;
  const size = rotatedPages.get(pageNumber);
  if (!size) return item;

  const patch = rotateRect(item.x, item.y, item.width, item.height, size.width, size.height);
  return { ...item, ...patch };
}

interface RotatedPageState {
  annotations: Annotation[];
  textEdits: TextContentEdit[];
  imageEdits: ImageContentEdit[];
  newFields: FormFieldDefinition[];
}

/** Remap annotations and page-indexed edits after permanent /Rotate changes. */
export function remapStateAfterPageRotation(
  state: RotatedPageState,
  pageNumbers: number[],
  degrees: 90 | 180 | 270 | -90,
  pageSizes: Map<number, PageSize>,
): RotatedPageState {
  const rotatedPages = new Map<number, PageSize>();
  for (const pageNumber of pageNumbers) {
    const size = pageSizes.get(pageNumber);
    if (size) rotatedPages.set(pageNumber, size);
  }

  return {
    annotations: state.annotations.map((annotation) => {
      const pageNumber = annotation.pageIndex + 1;
      const size = rotatedPages.get(pageNumber);
      if (!size) return annotation;
      return rotateAnnotationForPage(annotation, size.width, size.height, degrees);
    }),
    textEdits: state.textEdits.map((edit) =>
      rotatePageIndexedItem(edit, rotatedPages, (x, y, w, h, pw, ph) =>
        rotateViewportRect(x, y, w, h, pw, ph, degrees),
      ),
    ),
    imageEdits: state.imageEdits.map((edit) =>
      rotatePageIndexedItem(edit, rotatedPages, (x, y, w, h, pw, ph) =>
        rotateViewportRect(x, y, w, h, pw, ph, degrees),
      ),
    ),
    newFields: state.newFields.map((field) =>
      rotatePageIndexedItem(field, rotatedPages, (x, y, w, h, pw, ph) =>
        rotateViewportRect(x, y, w, h, pw, ph, degrees),
      ),
    ),
  };
}
