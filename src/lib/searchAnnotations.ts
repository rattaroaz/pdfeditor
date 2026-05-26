import type { Annotation, SearchMatch } from "@shared/types";

function annotationText(ann: Annotation): string {
  switch (ann.type) {
    case "note":
    case "text":
      return ann.content;
    case "stamp":
      return ann.stamp;
    default:
      return ann.type;
  }
}

export function searchAnnotations(
  annotations: Annotation[],
  query: string,
  caseSensitive = false,
  wholeWord = false,
): SearchMatch[] {
  if (!query.trim()) return [];
  const flags = caseSensitive ? "g" : "gi";
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
  const regex = new RegExp(pattern, flags);

  const matches: SearchMatch[] = [];
  let matchIndex = 0;

  for (const ann of annotations) {
    const text = annotationText(ann);
    if (regex.test(text)) {
      regex.lastIndex = 0;
      const found = text.match(regex);
      if (found?.[0]) {
        matches.push({
          pageIndex: ann.pageIndex,
          matchIndex: matchIndex++,
          text: found[0],
          source: "annotation",
          annotationId: ann.id,
        });
      }
    }
    regex.lastIndex = 0;
  }

  return matches;
}
