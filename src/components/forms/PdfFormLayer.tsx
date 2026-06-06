import { useEffect, useRef, useState, type CSSProperties } from "react";
import { log } from "@/lib/logging";
import { getFormWidgetsForPage } from "@/lib/pdf/pdfEngine";
import { useDocumentStore } from "@/stores/documentStore";
import { useFormStore } from "@/stores/formStore";
import { recordHistory } from "@/stores/historyStore";
import { useUiStore } from "@/stores/uiStore";
import { useAnnotationStore } from "@/stores/annotationStore";
import type { FormFieldDefinition, FormFieldKind, Tool } from "@shared/types";
import { defaultDropdownOptions, normalizeDropdownOptions } from "@/lib/dropdownOptions";
import { suggestUniqueFieldName } from "@/lib/formFieldName";
import {
  boxHeightFromFontSize,
  DEFAULT_TEXT_FONT_SIZE,
  dropdownBoxHeightFromFontSize,
  dropdownFieldTextStyle,
  fontSizeFromBoxHeight,
  layoutDropdownFromDrag,
  textBoxContentStyle,
} from "@/lib/textEditBox";
import { DropdownOptionsDialog } from "./DropdownOptionsDialog";
import { FormDropdownControl } from "./FormDropdownControl";
import { useLongPress } from "@/hooks/useLongPress";

function beginRenameNewField(field: FormFieldDefinition) {
  useFormStore.getState().requestRenameNewField(field.id);
  useFormStore.getState().setActiveField(field.name);
  useDocumentStore.getState().setSidebarTab("forms");
}

interface PdfFormLayerProps {
  pageNumber: number;
  scale: number;
}

const FORM_FIELD_CLASS =
  "absolute border-0 font-medium text-zinc-900 bg-white px-1 outline-none [color-scheme:light] placeholder:text-zinc-500 focus:outline-none focus:ring-0 box-border";

function fieldTextStyle(fieldHeight: number, scale: number): CSSProperties {
  const fontSize = fontSizeFromBoxHeight(fieldHeight);
  return {
    fontFamily: "Helvetica, Arial, sans-serif",
    fontSize: fontSize * scale,
    ...textBoxContentStyle(fontSize, scale),
  };
}

function widgetPositionStyle(
  widget: { x: number; y: number; width: number; height: number },
  scale: number,
): CSSProperties {
  return {
    ...fieldTextStyle(widget.height, scale),
    left: widget.x * scale,
    top: widget.y * scale,
    width: widget.width * scale,
    height: widget.height * scale,
  };
}

function selectWidgetPositionStyle(
  widget: { x: number; y: number; width: number; height: number },
  scale: number,
): CSSProperties {
  return {
    left: widget.x * scale,
    top: widget.y * scale,
    width: widget.width * scale,
    height: widget.height * scale,
  };
}

function normalizeTextFieldHeight(height: number): number {
  return boxHeightFromFontSize(fontSizeFromBoxHeight(height));
}

function normalizeDropdownFieldHeight(height: number): number {
  return layoutDropdownFromDrag(height).height;
}

function widgetBorderClass(widget: { type: string; required?: boolean }, error?: string): string {
  if (error) return "border-2 border-red-500";
  if (widget.type === "text") {
    return widget.required ? "ring-1 ring-amber-400" : "border-0 outline-none";
  }
  if (widget.type === "checkbox") {
    return widget.required ? "border-2 border-amber-400" : "border border-blue-400";
  }
  return widget.required ? "border-2 border-amber-400" : "border border-blue-400";
}

const PLACE_TOOLS: Tool[] = ["form-text", "form-checkbox", "form-dropdown"];

const MIN_DRAG_SIZE = 4;
const DRAG_THRESHOLD_PX = 5;
const MIN_DROPDOWN_WIDTH = 48;

const DEFAULT_FIELD_SIZE: Record<FormFieldKind, { width: number; height: number }> = {
  text: { width: 180, height: 24 },
  checkbox: { width: 18, height: 18 },
  dropdown: { width: 160, height: dropdownBoxHeightFromFontSize(DEFAULT_TEXT_FONT_SIZE) },
  radio: { width: 18, height: 18 },
  listbox: { width: 160, height: 80 },
};

type MovingField = {
  id: string;
  offsetX: number;
  offsetY: number;
};

type ResizingField = {
  id: string;
  originX: number;
  originY: number;
};

function toolToKind(tool: Tool): FormFieldKind {
  if (tool === "form-checkbox") return "checkbox";
  if (tool === "form-dropdown") return "dropdown";
  return "text";
}

function isChoiceWidget(type: string): boolean {
  return type === "combobox" || type === "dropdown" || type === "listbox";
}

/** Visible field chrome in Standard view (Acrobat-like). */
function acrobatFieldBorderClass(type: string): string {
  if (type === "checkbox" || type === "radio") return "border border-zinc-600";
  if (isChoiceWidget(type)) return "border border-zinc-500";
  return "border border-zinc-400";
}

function resolveFieldOptions(
  name: string,
  options: string[] | undefined,
  newFields: FormFieldDefinition[],
): string[] {
  if (options?.length) return options;
  return newFields.find((f) => f.name === name)?.options ?? [];
}

function optionsForSelect(value: string, options: string[]): string[] {
  if (!value || options.includes(value)) return options;
  return [value, ...options];
}

function widgetKey(widget: { id?: string; name: string; x: number; y: number }): string {
  return widget.id ?? `${widget.name}@${Math.round(widget.x)}:${Math.round(widget.y)}`;
}

function NewFieldPreview({
  field,
  scale,
  value,
  isSelected,
  isDragging,
  isResizing,
  openDropdownKey,
  onDropdownOpenChange,
  onBeginMove,
  onBeginResize,
}: {
  field: FormFieldDefinition;
  scale: number;
  value: string;
  isSelected: boolean;
  isDragging: boolean;
  isResizing: boolean;
  openDropdownKey: string | null;
  onDropdownOpenChange: (key: string | null) => void;
  onBeginMove: (e: React.MouseEvent, field: FormFieldDefinition) => void;
  onBeginResize: (e: React.MouseEvent, field: FormFieldDefinition) => void;
}) {
  const values = useFormStore((s) => s.values);
  const setFieldValue = useFormStore((s) => s.setFieldValue);
  const longPress = useLongPress(() => beginRenameNewField(field));

  const style = {
    left: field.x * scale,
    top: field.y * scale,
    width: field.width * scale,
    height: field.height * scale,
  };
  const dragClass = isDragging
    ? "cursor-grabbing ring-2 ring-violet-300"
    : "cursor-grab hover:bg-violet-400/30";

  const renameHandlers = {
    ...longPress.handlers,
    onMouseDown: (e: React.MouseEvent) => {
      if (longPress.wasLongPress()) {
        longPress.resetLongPress();
        return;
      }
      onBeginMove(e, field);
    },
  };

  if (field.kind === "checkbox") {
    return (
      <div
        key={field.id}
        title="Drag to move · long-press to rename"
        style={style}
        className={`absolute flex touch-none items-center justify-center border-2 border-dashed border-violet-400 bg-violet-400/20 ${dragClass} ${
          isSelected && !isDragging ? "ring-2 ring-violet-200" : ""
        }`}
        {...renameHandlers}
      >
        <span className="text-violet-200">☑</span>
        <span className="sr-only">{value}</span>
      </div>
    );
  }

  if (field.kind === "dropdown") {
    const options = field.options ?? ["Option 1", "Option 2"];
    const selected = values[field.name]?.value ?? field.defaultValue ?? options[0] ?? "";
    return (
      <div
        key={field.id}
        title="Drag to move · grab corner to resize · long-press to rename"
        style={style}
        className={`absolute touch-none overflow-visible border-2 border-dashed border-violet-400 bg-white ${dragClass} ${
          isSelected && !isDragging ? "ring-2 ring-violet-200" : ""
        } ${isResizing ? "ring-2 ring-violet-300" : ""}`}
        {...renameHandlers}
      >
        <FormDropdownControl
          controlKey={field.id}
          name={field.name}
          value={selected}
          options={optionsForSelect(selected, options)}
          textStyle={dropdownFieldTextStyle(field.height, scale)}
          fieldHeight={field.height}
          scale={scale}
          isOpen={openDropdownKey === field.id}
          onOpenChange={(open) => onDropdownOpenChange(open ? field.id : null)}
          onFocus={() => useFormStore.getState().setActiveField(field.name)}
          onChange={(next) => {
            recordHistory();
            setFieldValue(field.name, next, "dropdown");
            useDocumentStore.getState().setDirty(true);
          }}
        />
        {(isSelected || isResizing) && (
          <div
            role="presentation"
            title="Resize"
            className="absolute -bottom-1 -right-1 z-10 h-3 w-3 cursor-se-resize border border-violet-700 bg-white shadow-sm"
            data-testid="form-field-resize-handle"
            onMouseDown={(e) => onBeginResize(e, field)}
          />
        )}
      </div>
    );
  }

  return (
    <div
      key={field.id}
      title="Drag to move · long-press to rename"
      style={style}
      className={`absolute overflow-hidden border-2 border-dashed border-violet-400 bg-violet-400/20 ${dragClass} ${
        isSelected && !isDragging ? "ring-2 ring-violet-200" : ""
      }`}
      {...renameHandlers}
    >
      <textarea
        readOnly
        rows={1}
        value={value}
        placeholder={field.name}
        className="pointer-events-none block w-full resize-none border-0 bg-transparent px-1 font-medium text-zinc-900 outline-none"
        style={fieldTextStyle(field.height, scale)}
      />
    </div>
  );
}

export function PdfFormLayer({ pageNumber, scale }: PdfFormLayerProps) {
  const appMode = useUiStore((s) => s.appMode);
  const pdfDoc = useDocumentStore((s) => s.pdfDoc);
  const rotation = useDocumentStore((s) => s.rotation);
  const values = useFormStore((s) => s.values);
  const validationErrors = useFormStore((s) => s.validationErrors);
  const newFields = useFormStore((s) => s.newFields);
  const setFieldValue = useFormStore((s) => s.setFieldValue);
  const addNewField = useFormStore((s) => s.addNewField);
  const updateNewField = useFormStore((s) => s.updateNewField);
  const removeNewField = useFormStore((s) => s.removeNewField);
  const pendingDropdownFieldId = useFormStore((s) => s.pendingDropdownFieldId);
  const setPendingDropdownFieldId = useFormStore((s) => s.setPendingDropdownFieldId);
  const updateNewFieldPosition = useFormStore((s) => s.updateNewFieldPosition);
  const updateNewFieldSize = useFormStore((s) => s.updateNewFieldSize);
  const activeTool = useAnnotationStore((s) => s.activeTool);
  const activeFieldName = useFormStore((s) => s.activeFieldName);
  const formInfo = useFormStore((s) => s.formInfo);

  const [widgets, setWidgets] = useState<Awaited<ReturnType<typeof getFormWidgetsForPage>>>([]);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null);
  const [moving, setMoving] = useState<MovingField | null>(null);
  const [resizing, setResizing] = useState<ResizingField | null>(null);
  const [openDropdownKey, setOpenDropdownKey] = useState<string | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const inputRefs = useRef<
    Map<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>
  >(new Map());
  const pendingDragRef = useRef<
    (MovingField & { startClientX: number; startClientY: number }) | null
  >(null);

  const pageIndex = pageNumber - 1;
  const formsEditMode = appMode === "forms";
  const showForms = appMode === "forms" || appMode === "document";
  const placingField = formsEditMode && PLACE_TOOLS.includes(activeTool);
  const pageNewFields = newFields.filter((f) => f.pageIndex === pageIndex);

  const existingFieldNames = () => [
    ...Object.keys(values),
    ...newFields.map((f) => f.name),
    ...widgets.map((w) => w.name),
  ];

  useEffect(() => {
    if (!pdfDoc || !showForms) return;
    void getFormWidgetsForPage(pdfDoc, pageNumber, scale, rotation).then(setWidgets);
  }, [pdfDoc, pageNumber, scale, rotation, showForms, newFields.length]);

  useEffect(() => {
    if (appMode !== "forms" || !activeFieldName) return;
    const newField = pageNewFields.find((f) => f.name === activeFieldName);
    if (newField) setSelectedFieldId(newField.id);
    const timer = window.setTimeout(() => {
      inputRefs.current.get(activeFieldName)?.focus({ preventScroll: true });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [activeFieldName, appMode, pageNumber, widgets, pageNewFields]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!showForms || e.key !== "Tab") return;
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
  }, [showForms, widgets]);

  const localCoords = (e: { clientX: number; clientY: number }) => {
    const rect = layerRef.current?.getBoundingClientRect();
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
    useFormStore.getState().setActiveField(field.name);
  };

  const beginResizeField = (e: React.MouseEvent, field: FormFieldDefinition) => {
    e.stopPropagation();
    e.preventDefault();
    recordHistory();
    setOpenDropdownKey(null);
    setSelectedFieldId(field.id);
    useFormStore.getState().setActiveField(field.name);
    setResizing({ id: field.id, originX: field.x, originY: field.y });
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (resizing) {
        const coords = localCoords(e);
        const width = Math.max(MIN_DROPDOWN_WIDTH, coords.x - resizing.originX);
        const height = normalizeDropdownFieldHeight(
          Math.max(MIN_DRAG_SIZE, coords.y - resizing.originY),
        );
        updateNewFieldSize(resizing.id, width, height);
        return;
      }

      const pending = pendingDragRef.current;
      if (pending && !moving) {
        const dx = e.clientX - pending.startClientX;
        const dy = e.clientY - pending.startClientY;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        recordHistory();
        setOpenDropdownKey(null);
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
      if (resizing) {
        const resizeId = resizing.id;
        const field = useFormStore.getState().newFields.find((f) => f.id === resizeId);
        setResizing(null);
        useDocumentStore.getState().setDirty(true);
        if (field?.kind === "dropdown") {
          const { fontSize } = layoutDropdownFromDrag(field.height);
          log.form.info("Resized dropdown field", {
            userAction: "resize_dropdown_field",
            metadata: {
              name: field.name,
              pageIndex,
              width: field.width,
              height: field.height,
              fontSize,
            },
          });
        }
        return;
      }
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
  }, [moving, resizing, scale, pageIndex, updateNewFieldPosition, updateNewFieldSize]);

  if (!showForms) return null;

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

    if (width < MIN_DRAG_SIZE && height < MIN_DRAG_SIZE) {
      const defaults = DEFAULT_FIELD_SIZE[kind];
      width = defaults.width;
      height = defaults.height;
      x = x1;
      y = y1;
    }

    if (kind === "text") {
      height = normalizeTextFieldHeight(height);
    } else if (kind === "dropdown") {
      height = normalizeDropdownFieldHeight(height);
    }

    const suggestedName = suggestUniqueFieldName(existingFieldNames());

    if (kind === "dropdown") {
      const options = defaultDropdownOptions(2);
      const id = addNewField({
        pageIndex,
        name: suggestedName,
        kind: "dropdown",
        x,
        y,
        width,
        height,
        defaultValue: options[0] ?? "",
        required: false,
        readOnly: false,
        options,
      });
      setFieldValue(suggestedName, options[0] ?? "", "dropdown");
      useFormStore.getState().setActiveField(suggestedName);
      setSelectedFieldId(id);
      setPendingDropdownFieldId(id);
      useDocumentStore.getState().setDirty(true);
      const { fontSize } = layoutDropdownFromDrag(height);
      log.form.info("Placed form field", {
        userAction: "place_form_field",
        metadata: { name: suggestedName, kind: "dropdown", pageIndex, x, y, width, height, fontSize },
      });
      return;
    }

    const id = addNewField({
      pageIndex,
      name: suggestedName,
      kind,
      x,
      y,
      width,
      height,
      defaultValue: kind === "checkbox" ? "Off" : "",
      required: false,
      readOnly: false,
    });
    setFieldValue(suggestedName, kind === "checkbox" ? "Off" : "", kind);
    useFormStore.getState().setActiveField(suggestedName);
    setSelectedFieldId(id);
    useDocumentStore.getState().setDirty(true);
    log.form.info("Placed form field", {
      userAction: "place_form_field",
      metadata: { name: suggestedName, kind, pageIndex, x, y, width, height },
    });
  };

  const confirmPendingDropdown = (options: string[]) => {
    if (!pendingDropdownFieldId) return;
    const field = newFields.find((f) => f.id === pendingDropdownFieldId);
    if (!field) return;

    updateNewField(pendingDropdownFieldId, { options: normalizeDropdownOptions(options) });
    useFormStore.getState().setActiveField(field.name);
    setSelectedFieldId(pendingDropdownFieldId);
    setPendingDropdownFieldId(null);
    useDocumentStore.getState().setDirty(true);
    log.form.info("Configured dropdown field", {
      userAction: "configure_dropdown_field",
      metadata: {
        name: field.name,
        kind: "dropdown",
        pageIndex,
        optionCount: options.length,
        value: useFormStore.getState().values[field.name]?.value,
      },
    });
  };

  const cancelPendingDropdown = () => {
    if (pendingDropdownFieldId) {
      removeNewField(pendingDropdownFieldId);
      setSelectedFieldId(null);
    }
    setPendingDropdownFieldId(null);
  };

  const pendingDropdownField = pendingDropdownFieldId
    ? pageNewFields.find((f) => f.id === pendingDropdownFieldId)
    : null;

  const renderNewFieldPreview = (field: FormFieldDefinition) => (
    <NewFieldPreview
      key={field.id}
      field={field}
      scale={scale}
      value={values[field.name]?.value ?? field.defaultValue ?? ""}
      isSelected={selectedFieldId === field.id}
      isDragging={moving?.id === field.id}
      isResizing={resizing?.id === field.id}
      openDropdownKey={openDropdownKey}
      onDropdownOpenChange={setOpenDropdownKey}
      onBeginMove={beginMoveField}
      onBeginResize={beginResizeField}
    />
  );

  const standardNewFieldWidgets = pageNewFields.map((f) => ({
    id: f.id,
    name: f.name,
    type: f.kind === "dropdown" ? "combobox" : f.kind,
    pageIndex: f.pageIndex,
    x: f.x,
    y: f.y,
    width: f.width,
    height: f.height,
    value: values[f.name]?.value ?? f.defaultValue,
    options: f.options,
    required: f.required,
    readOnly: f.readOnly,
  }));

  const displayWidgets = formsEditMode ? widgets : [...widgets, ...standardNewFieldWidgets];

  return (
    <div
      ref={layerRef}
      className="absolute inset-0 z-[45]"
      style={{
        pointerEvents: formsEditMode || widgets.length > 0 || pageNewFields.length > 0 ? "auto" : "none",
        cursor: resizing ? "se-resize" : moving ? "grabbing" : placingField ? "crosshair" : undefined,
      }}
      onMouseDown={(e) => {
        if (!formsEditMode || moving || resizing || !placingField) return;
        e.stopPropagation();
        setSelectedFieldId(null);
        setStart(localCoords(e));
        setCurrent(localCoords(e));
      }}
      onMouseMove={(e) => {
        if (!formsEditMode || !start || !placingField || moving || resizing) return;
        setCurrent(localCoords(e));
      }}
      onMouseUp={(e) => {
        if (!formsEditMode || moving || resizing || !start || !placingField) return;
        e.stopPropagation();
        const end = localCoords(e);
        placeFieldAt(start.x, start.y, end.x, end.y);
        setStart(null);
        setCurrent(null);
      }}
    >
      {formsEditMode && pageNewFields.map(renderNewFieldPreview)}

      {displayWidgets.map((widget) => {
        const val = values[widget.name]?.value ?? widget.value ?? "";
        const error = validationErrors[widget.name];
        const commonStyle = widgetPositionStyle(widget, scale);
        const borderClass = formsEditMode
          ? widgetBorderClass(widget, error)
          : acrobatFieldBorderClass(widget.type);
        const key = widgetKey(widget);

        if (widget.type === "checkbox" || widget.type === "radio") {
          const checked =
            val === "true" || val === "Yes" || val === "On";
          return (
            <input
              key={key}
              ref={(el) => {
                if (el) inputRefs.current.set(key, el);
              }}
              type="checkbox"
              checked={checked}
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

        if (isChoiceWidget(widget.type)) {
          const options = optionsForSelect(
            val,
            resolveFieldOptions(widget.name, widget.options, newFields),
          );
          if (options.length === 0) {
            options.push(val || "—");
          }
          const displayValue = val || options[0] || "";
          const choiceStyle = selectWidgetPositionStyle(widget, scale);
          return (
            <div
              key={key}
              className={`absolute overflow-visible bg-white ${borderClass}`}
              style={choiceStyle}
            >
              <FormDropdownControl
                controlKey={key}
                name={widget.name}
                value={displayValue}
                options={options}
                textStyle={dropdownFieldTextStyle(widget.height, scale)}
                fieldHeight={widget.height}
                scale={scale}
                disabled={widget.readOnly}
                isOpen={openDropdownKey === key}
                onOpenChange={(open) => setOpenDropdownKey(open ? key : null)}
                onFocus={() => useFormStore.getState().setActiveField(widget.name)}
                registerRef={(el) => {
                  if (el) inputRefs.current.set(key, el);
                  else inputRefs.current.delete(key);
                }}
                onChange={(next) => {
                  recordHistory();
                  setFieldValue(widget.name, next, "dropdown");
                  useDocumentStore.getState().setDirty(true);
                }}
              />
            </div>
          );
        }

        return (
          <textarea
            key={key}
            ref={(el) => {
              if (el) inputRefs.current.set(key, el);
            }}
            rows={1}
            value={val}
            readOnly={widget.readOnly}
            placeholder={widget.name}
            className={`${FORM_FIELD_CLASS} ${borderClass} resize-none px-0`}
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

      {formsEditMode && start && current && placingField && !moving && !resizing && (
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

      {formsEditMode && placingField && pageNewFields.length === 0 && widgets.length === 0 && !start && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-violet-200/80">
          Click or drag to add a field. Drag placed fields to reposition. Resize dropdowns from the corner handle. Save to embed in the PDF.
        </div>
      )}

      {formsEditMode && pendingDropdownField && (
        <DropdownOptionsDialog
          fieldName={pendingDropdownField.name}
          initialOptions={pendingDropdownField.options}
          onConfirm={confirmPendingDropdown}
          onCancel={cancelPendingDropdown}
        />
      )}
    </div>
  );
}
