import { useEffect, useRef, type CSSProperties } from "react";
import { dropdownFontSizeFromBoxHeight, dropdownOptionRowStyle } from "@/lib/textEditBox";

/** Selected dropdown label (Tailwind zinc-900). */
export const DROPDOWN_SELECTED_TEXT = "#18181b";
/** Unselected dropdown labels — one shade lighter than selected (Tailwind zinc-800). */
export const DROPDOWN_UNSELECTED_TEXT = "#27272a";

interface FormDropdownControlProps {
  controlKey: string;
  name: string;
  value: string;
  options: string[];
  textStyle: CSSProperties;
  fieldHeight: number;
  scale: number;
  disabled?: boolean;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: string) => void;
  onFocus?: () => void;
  registerRef?: (el: HTMLButtonElement | null) => void;
}

export function FormDropdownControl({
  controlKey,
  name,
  value,
  options,
  textStyle,
  fieldHeight,
  scale,
  disabled = false,
  isOpen,
  onOpenChange,
  onChange,
  onFocus,
  registerRef,
}: FormDropdownControlProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const displayValue = value || options[0] || name;
  const fontSize = dropdownFontSizeFromBoxHeight(fieldHeight);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [isOpen, onOpenChange]);

  return (
    <div ref={rootRef} className="absolute inset-0">
      <button
        type="button"
        ref={registerRef}
        aria-label={name}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        className="absolute inset-0 border-0 bg-white text-left outline-none disabled:cursor-not-allowed disabled:opacity-60"
        style={{ ...textStyle, color: DROPDOWN_SELECTED_TEXT }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          onOpenChange(!isOpen);
          onFocus?.();
        }}
        onFocus={onFocus}
      >
        {displayValue}
      </button>
      <span
        className="pointer-events-none absolute inset-y-0 right-1 flex items-center text-xs"
        style={{ color: DROPDOWN_UNSELECTED_TEXT }}
      >
        ▾
      </span>
      {isOpen && !disabled && (
        <ul
          role="listbox"
          aria-label={name}
          className="absolute left-0 top-full z-[70] max-h-48 w-full overflow-y-auto border border-zinc-300 bg-white py-0.5 shadow-md"
          style={{ marginTop: 1 * scale }}
        >
          {options.map((opt) => {
            const selected = opt === value;
            return (
              <li key={`${controlKey}-${opt}`} role="option" aria-selected={selected}>
                <button
                  type="button"
                  className="block w-full border-0 bg-transparent text-left hover:bg-zinc-50"
                  style={{
                    ...dropdownOptionRowStyle(fontSize, scale),
                    color: selected ? DROPDOWN_SELECTED_TEXT : DROPDOWN_UNSELECTED_TEXT,
                    fontWeight: selected ? 500 : 400,
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(opt);
                    onOpenChange(false);
                  }}
                >
                  {opt}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
