export type ToolbarItemId =
  | "toolbar-modes"
  | "toolbar-undo-redo"
  | "toolbar-page-nav"
  | "toolbar-sidebar"
  | "toolbar-rotate"
  | "toolbar-zoom";

const ALL_TOOLBAR_ITEM_IDS: ToolbarItemId[] = [
  "toolbar-modes",
  "toolbar-undo-redo",
  "toolbar-page-nav",
  "toolbar-sidebar",
  "toolbar-rotate",
  "toolbar-zoom",
];

export const DEFAULT_TOOLBAR_ORDER: ToolbarItemId[] = [...ALL_TOOLBAR_ITEM_IDS];

const STORAGE_KEY = "pdfeditor.toolbarOrder";
const LEGACY_CHROME_LAYOUT_KEY = "pdfeditor.chromeLayout";

function isToolbarItemId(value: string): value is ToolbarItemId {
  return ALL_TOOLBAR_ITEM_IDS.includes(value as ToolbarItemId);
}

export function normalizeToolbarOrder(order: string[]): ToolbarItemId[] {
  const unique = order.filter(isToolbarItemId);
  const missing = ALL_TOOLBAR_ITEM_IDS.filter((id) => !unique.includes(id));
  return [...unique, ...missing];
}

export function loadToolbarOrder(): ToolbarItemId[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      if (Array.isArray(parsed)) return normalizeToolbarOrder(parsed);
    }
  } catch {
    // fall through to legacy migration
  }

  try {
    const legacy = localStorage.getItem(LEGACY_CHROME_LAYOUT_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as { toolbar?: string[] };
      if (Array.isArray(parsed.toolbar)) {
        return normalizeToolbarOrder(parsed.toolbar);
      }
    }
  } catch {
    // use default
  }

  return DEFAULT_TOOLBAR_ORDER;
}

export function saveToolbarOrder(order: ToolbarItemId[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
}

export function reorderToolbarOrder(
  order: ToolbarItemId[],
  fromId: ToolbarItemId,
  beforeId: ToolbarItemId | null,
): ToolbarItemId[] {
  const without = order.filter((id) => id !== fromId);
  if (beforeId === null) return [...without, fromId];
  const index = without.indexOf(beforeId);
  if (index < 0) return order;
  without.splice(index, 0, fromId);
  return without;
}

export function findToolbarInsertBeforeId(
  clientX: number,
  order: ToolbarItemId[],
  container: HTMLElement,
): ToolbarItemId | null {
  for (const id of order) {
    const el = container.querySelector(`[data-toolbar-id="${id}"]`);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    if (clientX < midX) return id;
  }
  return null;
}
