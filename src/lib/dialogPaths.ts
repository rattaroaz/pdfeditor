/** Normalize Tauri open-dialog result (single path or array). */
export function normalizeDialogPaths(
  selected: string | string[] | null | undefined,
): string[] {
  if (selected == null) return [];
  return Array.isArray(selected) ? selected : [selected];
}
