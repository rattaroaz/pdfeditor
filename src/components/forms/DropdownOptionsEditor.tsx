import {
  clampOptionCount,
  defaultDropdownOptions,
  MAX_DROPDOWN_OPTIONS,
  MIN_DROPDOWN_OPTIONS,
  resizeOptionList,
} from "@/lib/dropdownOptions";

interface DropdownOptionsEditorProps {
  options: string[];
  onChange: (options: string[]) => void;
  compact?: boolean;
}

export function DropdownOptionsEditor({
  options,
  onChange,
  compact = false,
}: DropdownOptionsEditorProps) {
  const labels = options.length > 0 ? options : defaultDropdownOptions(2);

  const setCount = (count: number) => {
    onChange(resizeOptionList(labels, count));
  };

  const setLabel = (index: number, value: string) => {
    const next = [...labels];
    next[index] = value;
    onChange(next);
  };

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="flex items-center gap-2">
        <label htmlFor="dropdown-option-count" className="text-xs text-zinc-400">
          Number of options
        </label>
        <input
          id="dropdown-option-count"
          type="number"
          min={MIN_DROPDOWN_OPTIONS}
          max={MAX_DROPDOWN_OPTIONS}
          value={labels.length}
          onChange={(e) => setCount(clampOptionCount(Number(e.target.value) || MIN_DROPDOWN_OPTIONS))}
          className="w-16 rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs text-zinc-100"
        />
      </div>
      <div className="space-y-1.5">
        {labels.map((label, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-[10px] text-zinc-500">{index + 1}.</span>
            <input
              type="text"
              value={label}
              placeholder={`Option ${index + 1}`}
              data-testid={`dropdown-option-${index}`}
              onChange={(e) => setLabel(index, e.target.value)}
              className="min-w-0 flex-1 rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs text-zinc-100"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
