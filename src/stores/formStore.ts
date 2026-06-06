import { create } from "zustand";
import type { FormFieldDefinition, FormFieldValue, FormInfo } from "@shared/types";
import { resolveDropdownValueAfterOptionsChange } from "@/lib/dropdownOptions";
import { fieldNameError, normalizeFieldName } from "@/lib/formFieldName";
import { recordHistory } from "@/stores/historyStore";
import { v4 as uuidv4 } from "uuid";

interface FormStore {
  formInfo: FormInfo | null;
  values: Record<string, FormFieldValue>;
  /** Last-saved field values; used to detect unsaved form edits. */
  valuesBaseline: Record<string, string>;
  newFields: FormFieldDefinition[];
  activeFieldName: string | null;
  renamingNewFieldId: string | null;
  pendingDropdownFieldId: string | null;
  validationErrors: Record<string, string>;
  setFormInfo: (info: FormInfo | null) => void;
  setValuesFromPdf: (values: Record<string, FormFieldValue>) => void;
  setFieldValue: (name: string, value: string, type?: FormFieldValue["type"]) => void;
  addNewField: (field: Omit<FormFieldDefinition, "id">) => string;
  updateNewField: (
    id: string,
    patch: Partial<Pick<FormFieldDefinition, "options" | "defaultValue" | "required" | "readOnly">>,
  ) => void;
  renameNewField: (id: string, name: string) => boolean;
  updateNewFieldPosition: (id: string, x: number, y: number) => void;
  updateNewFieldSize: (id: string, width: number, height: number) => void;
  removeNewField: (id: string) => void;
  setActiveField: (name: string | null) => void;
  requestRenameNewField: (id: string) => void;
  clearRenameNewField: () => void;
  setPendingDropdownFieldId: (id: string | null) => void;
  validateRequired: () => boolean;
  clearFormState: () => void;
  getValuesArray: () => FormFieldValue[];
  getChangedValuesArray: () => FormFieldValue[];
  hasPendingFormChanges: () => boolean;
  markValuesSaved: () => void;
}

function valuesBaselineFrom(values: Record<string, FormFieldValue>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).map(([name, field]) => [name, field.value]));
}

function existingFieldNames(
  state: Pick<FormStore, "values" | "newFields">,
  exceptFieldId?: string,
): string[] {
  return [
    ...Object.keys(state.values),
    ...state.newFields.filter((f) => f.id !== exceptFieldId).map((f) => f.name),
  ];
}

export const useFormStore = create<FormStore>((set, get) => ({
  formInfo: null,
  values: {},
  valuesBaseline: {},
  newFields: [],
  activeFieldName: null,
  renamingNewFieldId: null,
  pendingDropdownFieldId: null,
  validationErrors: {},

  setFormInfo: (formInfo) => set({ formInfo }),

  setValuesFromPdf: (values) =>
    set({
      values,
      valuesBaseline: valuesBaselineFrom(values),
    }),

  setFieldValue: (name, value, type = "text") =>
    set((s) => ({
      values: {
        ...s.values,
        [name]: { name, value, type, required: s.values[name]?.required },
      },
      validationErrors: { ...s.validationErrors, [name]: "" },
    })),

  addNewField: (partial) => {
    recordHistory();
    const id = uuidv4();
    set((s) => ({
      newFields: [...s.newFields, { ...partial, id }],
    }));
    return id;
  },

  updateNewField: (id, patch) => {
    recordHistory();
    const field = get().newFields.find((f) => f.id === id);
    if (!field) return;

    if (patch.options && field.kind === "dropdown") {
      const oldOptions = field.options ?? [];
      const mergedOptions = patch.options;
      const nextDefault = resolveDropdownValueAfterOptionsChange(
        oldOptions,
        mergedOptions,
        field.defaultValue ?? oldOptions[0] ?? "",
      );

      set((s) => ({
        newFields: s.newFields.map((f) =>
          f.id === id ? { ...f, ...patch, options: mergedOptions, defaultValue: nextDefault } : f,
        ),
      }));

      const current = get().values[field.name]?.value ?? "";
      const nextValue = resolveDropdownValueAfterOptionsChange(
        oldOptions,
        mergedOptions,
        current,
      );
      if (nextValue !== current) {
        get().setFieldValue(field.name, nextValue, "dropdown");
      }
      return;
    }

    set((s) => ({
      newFields: s.newFields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }));
  },

  renameNewField: (id, name) => {
    const field = get().newFields.find((f) => f.id === id);
    if (!field) return false;

    const normalized = normalizeFieldName(name);
    const error = fieldNameError(normalized, existingFieldNames(get(), id), field.name);
    if (error || normalized === field.name) return !error;

    recordHistory();
    const oldName = field.name;
    set((s) => {
      const values = { ...s.values };
      if (values[oldName]) {
        values[normalized] = { ...values[oldName], name: normalized };
        delete values[oldName];
      }
      const validationErrors = { ...s.validationErrors };
      if (validationErrors[oldName]) {
        validationErrors[normalized] = validationErrors[oldName];
        delete validationErrors[oldName];
      }
      return {
        newFields: s.newFields.map((f) => (f.id === id ? { ...f, name: normalized } : f)),
        values,
        validationErrors,
        activeFieldName: s.activeFieldName === oldName ? normalized : s.activeFieldName,
      };
    });
    return true;
  },

  updateNewFieldPosition: (id, x, y) =>
    set((s) => ({
      newFields: s.newFields.map((f) => (f.id === id ? { ...f, x, y } : f)),
    })),

  updateNewFieldSize: (id, width, height) =>
    set((s) => ({
      newFields: s.newFields.map((f) => (f.id === id ? { ...f, width, height } : f)),
    })),

  removeNewField: (id) => {
    recordHistory();
    set((s) => ({ newFields: s.newFields.filter((f) => f.id !== id) }));
  },

  setActiveField: (activeFieldName) => set({ activeFieldName }),

  requestRenameNewField: (id) => set({ renamingNewFieldId: id }),

  clearRenameNewField: () => set({ renamingNewFieldId: null }),

  setPendingDropdownFieldId: (pendingDropdownFieldId) => set({ pendingDropdownFieldId }),

  validateRequired: () => {
    const errors: Record<string, string> = {};
    for (const [name, field] of Object.entries(get().values)) {
      if (field.required && !field.value.trim()) {
        errors[name] = "Required field";
      }
    }
    for (const field of get().newFields) {
      if (field.required) {
        const val = get().values[field.name]?.value ?? "";
        if (!val.trim()) errors[field.name] = "Required field";
      }
    }
    set({ validationErrors: errors });
    return Object.keys(errors).length === 0;
  },

  clearFormState: () =>
    set({
      formInfo: null,
      values: {},
      valuesBaseline: {},
      newFields: [],
      activeFieldName: null,
      renamingNewFieldId: null,
      pendingDropdownFieldId: null,
      validationErrors: {},
    }),

  getValuesArray: () => Object.values(get().values),

  getChangedValuesArray: () => {
    const { values, valuesBaseline } = get();
    return Object.values(values).filter(
      (field) => (valuesBaseline[field.name] ?? "") !== field.value,
    );
  },

  hasPendingFormChanges: () => {
    const { newFields, values, valuesBaseline } = get();
    if (newFields.length > 0) return true;
    return Object.values(values).some(
      (field) => (valuesBaseline[field.name] ?? "") !== field.value,
    );
  },

  markValuesSaved: () =>
    set((s) => ({
      valuesBaseline: valuesBaselineFrom(s.values),
    })),
}));
