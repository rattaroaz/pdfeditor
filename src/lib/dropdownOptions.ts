export const MIN_DROPDOWN_OPTIONS = 1;
export const MAX_DROPDOWN_OPTIONS = 20;

export function defaultDropdownOptions(count = 2): string[] {
  const n = clampOptionCount(count);
  return Array.from({ length: n }, (_, i) => `Option ${i + 1}`);
}

export function clampOptionCount(count: number): number {
  return Math.min(MAX_DROPDOWN_OPTIONS, Math.max(MIN_DROPDOWN_OPTIONS, count));
}

/** Resize the option list when the user changes the count. Preserves existing labels. */
export function resizeOptionList(current: string[], count: number): string[] {
  const n = clampOptionCount(count);
  const next = current.slice(0, n).map((label, i) => label.trim() || `Option ${i + 1}`);
  while (next.length < n) {
    next.push(`Option ${next.length + 1}`);
  }
  return next;
}

export function normalizeDropdownOptions(options: string[]): string[] {
  const trimmed = options.map((o) => o.trim()).filter(Boolean);
  if (trimmed.length === 0) return defaultDropdownOptions(2);
  return trimmed.slice(0, MAX_DROPDOWN_OPTIONS);
}

/** Keep the same choice when option labels change (match by index, then by exact label). */
export function resolveDropdownValueAfterOptionsChange(
  oldOptions: string[],
  newOptions: string[],
  currentValue: string,
): string {
  if (!newOptions.length) return currentValue;
  if (currentValue && newOptions.includes(currentValue)) return currentValue;
  const idx = oldOptions.indexOf(currentValue);
  if (idx >= 0 && idx < newOptions.length) return newOptions[idx] ?? newOptions[0] ?? "";
  return newOptions[0] ?? "";
}
