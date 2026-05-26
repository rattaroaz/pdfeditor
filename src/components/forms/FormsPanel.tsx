import { useFormStore } from "@/stores/formStore";

export function FormsPanel() {
  const formInfo = useFormStore((s) => s.formInfo);
  const values = useFormStore((s) => s.values);
  const newFields = useFormStore((s) => s.newFields);
  const validationErrors = useFormStore((s) => s.validationErrors);

  if (formInfo?.hasXfa) {
    return (
      <p className="p-3 text-sm text-amber-300">
        This PDF uses XFA forms, which are not supported.
      </p>
    );
  }

  const entries = Object.values(values);

  return (
    <div className="flex-1 overflow-y-auto p-2 text-sm">
      <p className="mb-2 text-xs text-zinc-500">
        {formInfo?.fieldCount ?? 0} field(s) detected · {newFields.length} new
      </p>
      {entries.length === 0 && newFields.length === 0 && (
        <p className="text-zinc-500">No form fields. Switch to Forms mode and draw fields on the page.</p>
      )}
      <ul className="space-y-2">
        {newFields.map((field) => (
          <li key={field.id} className="rounded border border-violet-700/60 bg-violet-950/30 p-2">
            <div className="font-medium text-violet-200">{field.name}</div>
            <div className="text-xs text-violet-400">
              New {field.kind} · page {field.pageIndex + 1}
            </div>
            <div className="text-xs text-zinc-500">Saved on next document save</div>
          </li>
        ))}
        {entries.map((field) => (
          <li key={field.name} className="rounded border border-zinc-700 p-2">
            <div className="font-medium text-zinc-200">{field.name}</div>
            <div className="text-xs text-zinc-500">{field.type}</div>
            <div className="truncate text-zinc-200">{field.value || "—"}</div>
            {validationErrors[field.name] && (
              <div className="text-xs text-red-400">{validationErrors[field.name]}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
