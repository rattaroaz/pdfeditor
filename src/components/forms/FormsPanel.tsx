import { useFormStore } from "@/stores/formStore";
import { useDocumentStore } from "@/stores/documentStore";
import { normalizeDropdownOptions } from "@/lib/dropdownOptions";
import { navigateToFormField } from "@/lib/navigateToTarget";
import { DropdownOptionsEditor } from "./DropdownOptionsEditor";

export function FormsPanel() {
  const formInfo = useFormStore((s) => s.formInfo);
  const values = useFormStore((s) => s.values);
  const newFields = useFormStore((s) => s.newFields);
  const activeFieldName = useFormStore((s) => s.activeFieldName);
  const validationErrors = useFormStore((s) => s.validationErrors);
  const updateNewField = useFormStore((s) => s.updateNewField);

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
      <p className="mb-2 text-[10px] text-zinc-500">Double-click to jump to field on page</p>
      {entries.length === 0 && newFields.length === 0 && (
        <p className="text-zinc-500">No form fields. Switch to Forms mode and draw fields on the page.</p>
      )}
      <ul className="space-y-2">
        {newFields.map((field) => (
          <li key={field.id}>
            <button
              type="button"
              onClick={() => {
                useDocumentStore.getState().setCurrentPage(field.pageIndex + 1, { scroll: true });
                useFormStore.getState().setActiveField(field.name);
              }}
              onDoubleClick={(e) => {
                e.preventDefault();
                void navigateToFormField(field.name);
              }}
              className={`block w-full rounded border p-2 text-left ${
                activeFieldName === field.name
                  ? "border-violet-400 bg-violet-950/40 ring-1 ring-violet-400"
                  : "border-violet-700/60 bg-violet-950/30 hover:border-violet-500"
              }`}
            >
              <div className="font-medium text-violet-200">{field.name}</div>
              <div className="text-xs text-violet-400">
                New {field.kind} · page {field.pageIndex + 1}
              </div>
            </button>
            {field.kind === "dropdown" ? (
              <div className="mt-2 rounded border border-violet-800/60 bg-violet-950/20 p-2">
                <p className="mb-2 text-[10px] text-zinc-500">Edit dropdown choices</p>
                <DropdownOptionsEditor
                  compact
                  options={field.options ?? ["Option 1", "Option 2"]}
                  onChange={(options) => {
                    updateNewField(field.id, { options: normalizeDropdownOptions(options) });
                    useDocumentStore.getState().setDirty(true);
                  }}
                />
              </div>
            ) : (
              <div className="mt-1 px-2 text-xs text-zinc-500">Saved on next document save</div>
            )}
          </li>
        ))}
        {entries.map((field) => (
          <li key={field.name}>
            <button
              type="button"
              onClick={() => useFormStore.getState().setActiveField(field.name)}
              onDoubleClick={(e) => {
                e.preventDefault();
                void navigateToFormField(field.name);
              }}
              className={`block w-full rounded border p-2 text-left ${
                activeFieldName === field.name
                  ? "border-blue-400 bg-zinc-800 ring-1 ring-blue-400"
                  : "border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/50"
              }`}
            >
              <div className="font-medium text-zinc-200">{field.name}</div>
              <div className="text-xs text-zinc-500">{field.type}</div>
              <div className="truncate text-zinc-200">{field.value || "—"}</div>
              {validationErrors[field.name] && (
                <div className="text-xs text-red-400">{validationErrors[field.name]}</div>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
