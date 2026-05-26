import type { Annotation } from "@shared/types";

/** Remap annotation page indices after deleting 1-indexed page numbers. */
export function remapAnnotationsAfterDelete(
  annotations: Annotation[],
  deletedPageNumbers: number[],
): Annotation[] {
  const deletedZeroBased = new Set(deletedPageNumbers.map((p) => p - 1));

  return annotations
    .filter((ann) => !deletedZeroBased.has(ann.pageIndex))
    .map((ann) => {
      const shift = deletedPageNumbers.filter((p) => p - 1 < ann.pageIndex).length;
      return { ...ann, pageIndex: ann.pageIndex - shift };
    });
}

/** Remap annotation page indices after reorder. newOrder is 1-indexed page numbers in new positions. */
export function remapAnnotationsAfterReorder(
  annotations: Annotation[],
  newOrder: number[],
): Annotation[] {
  return annotations
    .map((ann) => {
      const newIndex = newOrder.indexOf(ann.pageIndex + 1);
      return newIndex >= 0 ? { ...ann, pageIndex: newIndex } : ann;
    })
  ;
}

export function remapAnnotationsAfterInsert(
  annotations: Annotation[],
  afterPage: number,
  insertCount: number,
): Annotation[] {
  return annotations.map((ann) =>
    ann.pageIndex >= afterPage
      ? { ...ann, pageIndex: ann.pageIndex + insertCount }
      : ann,
  );
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
