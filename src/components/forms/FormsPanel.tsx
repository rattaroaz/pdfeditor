import { useEffect, useRef, useState } from "react";

import { useFormStore } from "@/stores/formStore";

import { useDocumentStore } from "@/stores/documentStore";

import { fieldNameError, normalizeFieldName } from "@/lib/formFieldName";

import { normalizeDropdownOptions } from "@/lib/dropdownOptions";

import { navigateToFormField } from "@/lib/navigateToTarget";

import { useLongPress } from "@/hooks/useLongPress";

import type { FormFieldDefinition, FormFieldKind } from "@shared/types";

import { DropdownOptionsEditor } from "./DropdownOptionsEditor";



const KIND_LABELS: Record<FormFieldKind, string> = {

  text: "Text",

  checkbox: "Check",

  dropdown: "List",

  radio: "Radio",

  listbox: "List",

};



function fieldKindAvatar(kind: FormFieldKind): string {

  switch (kind) {

    case "text":

      return "Tx";

    case "checkbox":

      return "☑";

    case "dropdown":

      return "▾";

    default:

      return "F";

  }

}



function NewFieldRow({

  field,

  isActive,

  isRenaming,

  onStartRename,

  onFinishRename,

  onSelect,

  onNavigate,

}: {

  field: FormFieldDefinition;

  isActive: boolean;

  isRenaming: boolean;

  onStartRename: () => void;

  onFinishRename: (name: string) => void;

  onSelect: () => void;

  onNavigate: () => void;

}) {

  const [draft, setDraft] = useState(field.name);

  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const values = useFormStore((s) => s.values);

  const newFields = useFormStore((s) => s.newFields);

  const longPress = useLongPress(onStartRename);



  useEffect(() => {

    if (isRenaming) {

      setDraft(field.name);

      setError(null);

      inputRef.current?.focus();

      inputRef.current?.select();

    }

  }, [isRenaming, field.name]);



  const commitRename = () => {

    const normalized = normalizeFieldName(draft);

    const taken = [

      ...Object.keys(values),

      ...newFields.filter((f) => f.id !== field.id).map((f) => f.name),

    ];

    const validationError = fieldNameError(normalized, taken, field.name);

    if (validationError) {

      setError(validationError);

      return;

    }

    onFinishRename(normalized);

  };



  return (

    <div

      className={`flex gap-2 rounded border p-2 ${

        isActive

          ? "border-violet-400 bg-violet-950/40 ring-1 ring-violet-400"

          : "border-violet-700/60 bg-violet-950/30"

      }`}

    >

      <button

        type="button"

        title="Long-press to rename field"

        aria-label={`${field.name} — long-press to rename`}

        data-testid={`form-field-avatar-${field.id}`}

        className="flex h-10 w-10 shrink-0 select-none flex-col items-center justify-center rounded-md border border-violet-600/80 bg-violet-900/50 text-violet-100 hover:border-violet-400 hover:bg-violet-900 touch-none"

        {...longPress.handlers}

        onClick={(e) => {

          e.stopPropagation();

          if (longPress.wasLongPress()) {

            longPress.resetLongPress();

            return;

          }

          onSelect();

        }}

      >

        <span className="text-sm font-semibold leading-none">{fieldKindAvatar(field.kind)}</span>

        <span className="mt-0.5 text-[8px] uppercase tracking-wide text-violet-300/90">

          {KIND_LABELS[field.kind]}

        </span>

      </button>



      <div className="min-w-0 flex-1">

        {isRenaming ? (

          <div>

            <label className="mb-1 block text-[10px] text-zinc-500" htmlFor={`rename-${field.id}`}>

              Rename field

            </label>

            <input

              ref={inputRef}

              id={`rename-${field.id}`}

              type="text"

              value={draft}

              onChange={(e) => {

                setDraft(e.target.value);

                setError(null);

              }}

              onBlur={commitRename}

              onKeyDown={(e) => {

                if (e.key === "Enter") {

                  e.preventDefault();

                  (e.target as HTMLInputElement).blur();

                }

                if (e.key === "Escape") {

                  e.preventDefault();

                  onFinishRename(field.name);

                }

              }}

              className="w-full rounded border border-violet-500 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-violet-300"

            />

            {error && <p className="mt-1 text-[10px] text-red-400">{error}</p>}

          </div>

        ) : (

          <button

            type="button"

            onClick={onSelect}

            onDoubleClick={(e) => {

              e.preventDefault();

              onNavigate();

            }}

            className="block w-full text-left"

          >

            <div className="font-medium text-violet-200">{field.name}</div>

            <div className="text-xs text-violet-400">

              New {field.kind} · page {field.pageIndex + 1}

            </div>

          </button>

        )}

      </div>

    </div>

  );

}



export function FormsPanel() {

  const formInfo = useFormStore((s) => s.formInfo);

  const values = useFormStore((s) => s.values);

  const newFields = useFormStore((s) => s.newFields);

  const activeFieldName = useFormStore((s) => s.activeFieldName);

  const validationErrors = useFormStore((s) => s.validationErrors);

  const updateNewField = useFormStore((s) => s.updateNewField);

  const renameNewField = useFormStore((s) => s.renameNewField);

  const renamingFieldId = useFormStore((s) => s.renamingNewFieldId);

  const requestRenameNewField = useFormStore((s) => s.requestRenameNewField);

  const clearRenameNewField = useFormStore((s) => s.clearRenameNewField);



  if (formInfo?.hasXfa) {

    return (

      <p className="p-3 text-sm text-amber-300">

        This PDF uses XFA forms, which are not supported.

      </p>

    );

  }



  const entries = Object.values(values).filter(
    (field) => !newFields.some((f) => f.name === field.name),
  );



  return (

    <div className="flex-1 overflow-y-auto p-2 text-sm">

      <p className="mb-2 text-xs text-zinc-500">

        {formInfo?.fieldCount ?? 0} field(s) detected · {newFields.length} new

      </p>

      <p className="mb-2 text-[10px] text-zinc-500">

        Double-click a field to jump to it · long-press the field icon to rename

      </p>

      {entries.length === 0 && newFields.length === 0 && (

        <p className="text-zinc-500">No form fields. Switch to Forms mode and draw fields on the page.</p>

      )}

      <ul className="space-y-2">

        {newFields.map((field) => (

          <li key={field.id}>

            <NewFieldRow

              field={field}

              isActive={activeFieldName === field.name}

              isRenaming={renamingFieldId === field.id}

              onStartRename={() => requestRenameNewField(field.id)}

              onFinishRename={(name) => {

                if (name !== field.name) {

                  renameNewField(field.id, name);

                  useDocumentStore.getState().setDirty(true);

                }

                clearRenameNewField();

              }}

              onSelect={() => {

                useDocumentStore.getState().setCurrentPage(field.pageIndex + 1, { scroll: true });

                useFormStore.getState().setActiveField(field.name);

              }}

              onNavigate={() => void navigateToFormField(field.name)}

            />

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

