/** Normalize a user-visible PDF field name. */
export function normalizeFieldName(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return trimmed.replace(/[^\w \-]/g, "").trim();
}

/** Case- and spacing-insensitive key for duplicate checks. */
export function fieldNameKey(name: string): string {
  return normalizeFieldName(name).toLowerCase().replace(/\s+/g, "");
}

export function fieldNameError(
  name: string,
  taken: string[],
  currentName?: string,
): string | null {
  if (!name) return "Field name is required";
  if (name.length > 64) return "Field name is too long";
  const key = fieldNameKey(name);
  if (currentName && fieldNameKey(currentName) === key) return null;
  if (taken.some((t) => fieldNameKey(t) === key)) return "That name is already in use";
  return null;
}

/** Default names: Field 1, Field 2, … */
export function suggestUniqueFieldName(taken: string[]): string {
  const keys = new Set(taken.map(fieldNameKey));
  for (let i = 1; i < 10_000; i++) {
    const candidate = normalizeFieldName(`Field ${i}`);
    if (!keys.has(fieldNameKey(candidate))) return candidate;
  }
  return normalizeFieldName(`Field ${Date.now()}`);
}
