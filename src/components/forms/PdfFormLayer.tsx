import { useEffect, useRef, useState, type RefObject } from "react";
import { getFormWidgetsForPage } from "@/lib/pdf/pdfEngine";
import { useDocumentStore } from "@/stores/documentStore";
import { useFormStore } from "@/stores/formStore";
import { recordHistory } from "@/stores/historyStore";
import { useUiStore } from "@/stores/uiStore";
import { useAnnotationStore } from "@/stores/annotationStore";
import type { FormFieldDefinition, FormFieldKind, Tool } from "@shared/types";

interface PdfFormLayerProps {
  pageNumber: number;
  scale: number;
  canvasRef?: RefObject<HTMLCanvasElement | null>;
}

const FORM_FIELD_CLASS =
  "absolute text-sm font-medium text-zinc-900 bg-white px-1 [color-scheme:light] placeholder:text-zinc-500";

const PLACE_TOOLS: Tool[] = ["form-text", "form-checkbox", "form-dropdown"];

const MIN_DRAG_SIZE = 4;
const DRAG_THRESHOLD_PX = 5;

const DEFAULT_FIELD_SIZE: Record<FormFieldKind, { width: number; height: number }> = {
  text: { width: 180, height: 24 },
  checkbox: { width: 18, height: 18 },
  dropdown: { width: 160, height: 24 },
  radio: { width: 18, height: 18 },
  listbox: { width: 160, height: 80 },
};

type MovingField = {
  id: string;
  offsetX: number;
  offsetY: number;
};

function toolToKind(tool: Tool): FormFieldKind {
  if (tool === "form-checkbox") return "checkbox";
  if (tool === "form-dropdown") return "dropdown";
  return "text";
}

export function PdfFormLayer({ pageNumber, scale, canvasRef }: PdfFormLayerProps) {
  const appMode = useUiStore((s) => s.appMode);
  const pdfDoc = useDocumentStore((s) => s.pdfDoc);
  const rotation = useDocumentStore((s) => s.rotation);
  const values = useFormStore((s) => s.values);
  const validationErrors = useFormStore((s) => s.validationErrors);
  const newFields = useFormStore((s) => s.newFields);
  const setFieldValue = useFormStore((s) => s.setFieldValue);
  const addNewField = useFormStore((s) => s.addNewField);
  const updateNewFieldPosition = useFormStore((s) => s.updateNewFieldPosition);
  const activeTool = useAnnotationStore((s) => s.activeTool);
  const formInfo = useFormStore((s) => s.formInfo);

  const [widgets, setWidgets] = useState<Awaited<ReturnType<typeof getFormWidgetsForPage>>>([]);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null);
  const [moving, setMoving] = useState<MovingField | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const inputRefs = useRef<Map<string, HTMLInputElement | HTMLSelectElement>>(new Map());
  const pendingDragRef = useRef<
    (MovingField & { startClientX: number; startClientY: number }) | null
  >(null);

  const pageIndex = pageNumber - 1;
  const placingField = PLACE_TOOLS.includes(activeTool);
  const pageNewFields = newFields.filter((f) => f.pageIndex === pageIndex);

  useEffect(() => {
    if (!pdfDoc || appMode !== "forms") return;
    void getFormWidgetsForPage(pdfDoc, pageNumber, scale, rotation).then(setWidgets);
  }, [pdfDoc, pageNumber, scale, rotation, appMode, newFields.length]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (appMode !== "forms" || e.key !== "Tab") return;
      const names = widgets.map((w) => w.name);
      const idx = names.findIndex((n) => n === useFormStore.getState().activeFieldName);
      const next = e.shiftKey ? idx - 1 : idx + 1;
      if (next >= 0 && next < names.length) {
        e.preventDefault();
        const name = names[next];
        useFormStore.getState().setActiveField(name);
        inputRefs.current.get(name)?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [appMode, widgets]);

  const localCoords = (e: { clientX: number; clientY: number }) => {
    const target = canvasRef?.current ?? layerRef.current;
    const rect = target?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
  };

  const beginMoveField = (e: React.MouseEvent, field: FormFieldDefinition) => {
    e.stopPropagation();
    e.preventDefault();
    const coords = localCoords(e);
    pendingDragRef.current = {
      id: field.id,
      offsetX: coords.x - field.x,
      offsetY: coords.y - field.y,
      startClientX: e.clientX,
      startClientY: e.clientY,
    };
    setSelectedFieldId(field.id);
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const pending = pendingDragRef.current;
      if (pending && !moving) {
        const dx = e.clientX - pending.startClientX;
        const dy = e.clientY - pending.startClientY;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        recordHistory();
        setMoving({
          id: pending.id,
          offsetX: pending.offsetX,
          offsetY: pending.offsetY,
        });
        pendingDragRef.current = null;
        return;
      }

      if (!moving) return;
      const coords = localCoords(e);
      updateNewFieldPosition(moving.id, coords.x - moving.offsetX, coords.y - moving.offsetY);
    };

    const onUp = () => {
      pendingDragRef.current = null;
      if (moving) {
        setMoving(null);
        useDocumentStore.getState().setDirty(true);
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [moving, scale, updateNewFieldPosition, canvasRef]);

  if (appMode !== "forms") return null;

  if (formInfo?.hasXfa) {
    return (
      <div className="absolute inset-0 z-30 flex items-center justify-center bg-amber-950/80 p-4 text-center text-sm text-amber-100">
        XFA dynamic forms are not supported. Convert to AcroForm or use Adobe Acrobat.
      </div>
    );
  }

  const placeFieldAt = (x1: number, y1: number, x2: number, y2: number) => {
    if (!placingField) return;

    const kind = toolToKind(activeTool);
    let x = Math.min(x1, x2);
    let y = Math.min(y1, y2);
    let width = Math.abs(x2 - x1);
    let height = Math.abs(y2 - y1);

    if (width < MIN_DRAG_SIZE || height < MIN_DRAG_SIZE) {
      const defaults = DEFAULT_FIELD_SIZE[kind];
      width = defaults.width;
      height = defaults.height;
      x = x1;
      y = y1;
    }

    const existingNames = new Set([
      ...Object.keys(values),
      ...newFields.map((f) => f.name),
      ...widgets.map((w) => w.name),
    ]);
    let n = 1;
    let name = `Field${n}`;
    while (existingNames.has(name)) {
      n += 1;
      name = `Field${n}`;
    }

    addNewField({
      pageIndex,
      name,
      kind,
      x,
      y,
      width,
      height,
      defaultValue: kind === "checkbox" ? "Off" : "",
      required: false,
      readOnly: false,
      options: kind === "dropdown" ? ["Option 1", "Option 2"] : undefined,
    });
    setFieldValue(name, kind === "checkbox" ? "Off" : "", kind);
    useDocumentStore.getState().setDirty(true);
  };

  const renderNewFieldPreview = (field: FormFieldDefinition) => {
    const val = values[field.name]?.value ?? field.defaultValue ?? "";
    const isSelected = selectedFieldId === field.id;
    const isDragging = moving?.id === field.id;
    const style = {
      left: field.x * scale,
      top: field.y * scale,
      width: field.width * scale,
      height: field.height * scale,
    };
    const dragClass = isDragging
      ? "cursor-grabbing ring-2 ring-violet-300"
      : "cursor-grab hover:bg-violet-400/30";

    const commonProps = {
      title: "Drag to move",
      style,
      onMouseDown: (e: React.MouseEvent) => beginMoveField(e, field),
    };

    if (field.kind === "checkbox") {
      return (
        <div
          key={field.id}
          {...commonProps}
          className={`absolute flex items-center justify-center border-2 border-dashed border-violet-400 bg-violet-400/20 ${dragClass} ${
            isSelected && !isDragging ? "ring-2 ring-violet-200" : ""
          }`}
        >
          <span className="text-violet-200">☑</span>
          <span className="sr-only">{val}</span>
        </div>
      );
    }

    if (field.kind === "dropdown") {
      return (
        <div
          key={field.id}
          {...commonProps}
          className={`absolute border-2 border-dashed border-violet-400 bg-violet-400/20 px-1 text-xs text-violet-100 ${dragClass} ${
            isSelected && !isDragging ? "ring-2 ring-violet-200" : ""
          }`}
        >
          {field.options?.[0] ?? "Dropdown"}
        </div>
      );
    }

    return (
      <div
        key={field.id}
        {...commonProps}
        className={`absolute border-2 border-dashed border-violet-400 bg-violet-400/20 px-1 text-xs text-violet-100 ${dragClass} ${
          isSelected && !isDragging ? "ring-2 ring-violet-200" : ""
        }`}
      >
        {field.name}
      </div>
    );
  };

  return (
    <div
      ref={layerRef}
      className="absolute inset-0 z-[35]"
      style={{
        pointerEvents: "auto",
        cursor: moving ? "grabbing" : placingField ? "crosshair" : undefined,
      }}
      onMouseDown={(e) => {
        if (moving || !placingField) return;
        e.stopPropagation();
        setSelectedFieldId(null);
        setStart(localCoords(e));
        setCurrent(localCoords(e));
      }}
      onMouseMove={(e) => {
        if (start && placingField && !moving) setCurrent(localCoords(e));
      }}
      onMouseUp={(e) => {
        if (moving || !start || !placingField) return;
        e.stopPropagation();
        const end = localCoords(e);
        placeFieldAt(start.x, start.y, end.x, end.y);
        setStart(null);
        setCurrent(null);
      }}
    >
      {pageNewFields.map(renderNewFieldPreview)}

      {widgets.map((widget) => {
        const val = values[widget.name]?.value ?? widget.value ?? "";
        const error = validationErrors[widget.name];
        const commonStyle = {
          left: widget.x,
          top: widget.y,
          width: widget.width,
          height: widget.height,
        };
        const borderClass = error
          ? "border-2 border-red-500"
          : widget.required
            ? "border-2 border-amber-400"
            : "border border-blue-400";

        if (widget.type === "checkbox") {
          return (
            <input
              key={widget.name}
              ref={(el) => {
                if (el) inputRefs.current.set(widget.name, el);
              }}
              type="checkbox"
              checked={val === "true" || val === "Yes"}
              readOnly={widget.readOnly}
              className={`absolute ${borderClass} bg-white [color-scheme:light]`}
              style={commonStyle}
              onChange={(e) => {
                recordHistory();
                setFieldValue(widget.name, e.target.checked ? "Yes" : "Off", "checkbox");
                useDocumentStore.getState().setDirty(true);
              }}
            />
          );
        }

        if (widget.type === "combobox" || widget.type === "dropdown") {
          return (
            <select
              key={widget.name}
              ref={(el) => {
                if (el) inputRefs.current.set(widget.name, el);
              }}
              value={val}
              disabled={widget.readOnly}
              className={`${FORM_FIELD_CLASS} ${borderClass}`}
              style={commonStyle}
              onChange={(e) => {
                recordHistory();
                setFieldValue(widget.name, e.target.value, "dropdown");
                useDocumentStore.getState().setDirty(true);
              }}
            >
              {(widget.options ?? []).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          );
        }

        return (
          <input
            key={widget.name}
            ref={(el) => {
              if (el) inputRefs.current.set(widget.name, el);
            }}
            type="text"
            value={val}
            readOnly={widget.readOnly}
            placeholder={widget.name}
            className={`${FORM_FIELD_CLASS} ${borderClass}`}
            style={commonStyle}
            onChange={(e) => {
              setFieldValue(widget.name, e.target.value, "text");
              useDocumentStore.getState().setDirty(true);
            }}
            onFocus={() => {
              recordHistory();
              useFormStore.getState().setActiveField(widget.name);
            }}
          />
        );
      })}

      {start && current && placingField && !moving && (
        <div
          className="pointer-events-none absolute border-2 border-violet-400 bg-violet-400/15"
          style={{
            left: Math.min(start.x, current.x) * scale,
            top: Math.min(start.y, current.y) * scale,
            width: Math.abs(current.x - start.x) * scale,
            height: Math.abs(current.y - start.y) * scale,
          }}
        />
      )}

      {placingField && pageNewFields.length === 0 && widgets.length === 0 && !start && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-violet-200/80">
          Click or drag to add a field. Drag placed fields to reposition. Save to embed in the PDF.
        </div>
      )}
    </div>
  );
}
