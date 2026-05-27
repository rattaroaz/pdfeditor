import { create } from "zustand";
import type { FormFieldDefinition, FormFieldValue, FormInfo } from "@shared/types";
import { recordHistory } from "@/stores/historyStore";
import { v4 as uuidv4 } from "uuid";

interface FormStore {
  formInfo: FormInfo | null;
  values: Record<string, FormFieldValue>;
  newFields: FormFieldDefinition[];
  activeFieldName: string | null;
  validationErrors: Record<string, string>;
  setFormInfo: (info: FormInfo | null) => void;
  setFieldValue: (name: string, value: string, type?: FormFieldValue["type"]) => void;
  addNewField: (field: Omit<FormFieldDefinition, "id">) => void;
  updateNewFieldPosition: (id: string, x: number, y: number) => void;
  removeNewField: (id: string) => void;
  setActiveField: (name: string | null) => void;
  validateRequired: () => boolean;
  clearFormState: () => void;
  getValuesArray: () => FormFieldValue[];
}

export const useFormStore = create<FormStore>((set, get) => ({
  formInfo: null,
  values: {},
  newFields: [],
  activeFieldName: null,
  validationErrors: {},

  setFormInfo: (formInfo) => set({ formInfo }),

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
    set((s) => ({
      newFields: [...s.newFields, { ...partial, id: uuidv4() }],
    }));
  },

  updateNewFieldPosition: (id, x, y) =>
    set((s) => ({
      newFields: s.newFields.map((f) => (f.id === id ? { ...f, x, y } : f)),
    })),

  removeNewField: (id) => {
    recordHistory();
    set((s) => ({ newFields: s.newFields.filter((f) => f.id !== id) }));
  },

  setActiveField: (activeFieldName) => set({ activeFieldName }),

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
      newFields: [],
      activeFieldName: null,
      validationErrors: {},
    }),

  getValuesArray: () => Object.values(get().values),
}));
