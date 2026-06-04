import { useState } from "react";
import { defaultDropdownOptions, normalizeDropdownOptions } from "@/lib/dropdownOptions";
import { DropdownOptionsEditor } from "./DropdownOptionsEditor";

interface DropdownOptionsDialogProps {
  fieldName: string;
  onConfirm: (options: string[]) => void;
  onCancel: () => void;
}

export function DropdownOptionsDialog({
  fieldName,
  onConfirm,
  onCancel,
}: DropdownOptionsDialogProps) {
  const [options, setOptions] = useState(() => defaultDropdownOptions(2));

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-labelledby="dropdown-options-title"
        className="w-full max-w-sm rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="dropdown-options-title" className="text-base font-semibold text-zinc-100">
          Dropdown options
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Configure choices for <span className="text-zinc-300">{fieldName}</span>.
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
            onClick={() => onConfirm(normalizeDropdownOptions(options))}
            className="rounded-md bg-violet-600 px-3 py-1.5 text-sm text-white hover:bg-violet-500"
          >
            Add dropdown
          </button>
        </div>
      </div>
    </div>
  );
}
