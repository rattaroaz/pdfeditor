import type { ScannedImage } from "@shared/types";

export interface QueuedScanPage {
  id: string;
  image: ScannedImage;
  selected: boolean;
}

export function queueScanPages(images: ScannedImage[], selected = true): QueuedScanPage[] {
  return images.map((image) => ({
    id: crypto.randomUUID(),
    image,
    selected,
  }));
}

export function selectedScanImages(pages: QueuedScanPage[]): ScannedImage[] {
  return pages.filter((page) => page.selected).map((page) => page.image);
}

export function setPageSelected(
  pages: QueuedScanPage[],
  id: string,
  selected: boolean,
): QueuedScanPage[] {
  return pages.map((page) => (page.id === id ? { ...page, selected } : page));
}

export function setAllPagesSelected(pages: QueuedScanPage[], selected: boolean): QueuedScanPage[] {
  return pages.map((page) => ({ ...page, selected }));
}

export function removeQueuedPage(pages: QueuedScanPage[], id: string): QueuedScanPage[] {
  return pages.filter((page) => page.id !== id);
}
