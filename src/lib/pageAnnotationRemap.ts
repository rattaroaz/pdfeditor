import type { Annotation } from "@shared/types";

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
