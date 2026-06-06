import { useState } from "react";

import { defaultDropdownOptions, normalizeDropdownOptions } from "@/lib/dropdownOptions";

import { DropdownOptionsEditor } from "./DropdownOptionsEditor";

interface DropdownOptionsDialogProps {
  fieldName: string;
  initialOptions?: string[];
  onConfirm: (options: string[]) => void;
  onCancel: () => void;
}

export function DropdownOptionsDialog({
  fieldName,
  initialOptions,
  onConfirm,
  onCancel,
}: DropdownOptionsDialogProps) {
  const [options, setOptions] = useState(
    () => initialOptions?.length ? [...initialOptions] : defaultDropdownOptions(2),
  );

  const submit = () => {
    onConfirm(normalizeDropdownOptions(options));
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-labelledby="dropdown-options-title"
        data-testid="dropdown-options-dialog"
        className="w-full max-w-sm rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="dropdown-options-title" className="text-base font-semibold text-zinc-100">
          New dropdown field
        </h2>
        <p className="mt-2 text-xs text-zinc-400">
          Field name: <span className="font-medium text-violet-200">{fieldName}</span>
          <span className="block text-[10px] text-zinc-500">
            Long-press the field icon in the Forms panel to rename.
          </span>
        </p>
        <div className="mt-4">
          <DropdownOptionsEditor options={options} onChange={setOptions} />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            data-testid="dropdown-options-confirm"
            className="rounded-md bg-violet-600 px-3 py-1.5 text-sm text-white hover:bg-violet-500"
          >
            Add dropdown
          </button>
        </div>
      </div>
    </div>
  );
}
