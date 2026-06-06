import { describe, expect, it, beforeEach } from "vitest";
import { useFormStore } from "./formStore";
import { layoutDropdownFromDrag } from "@/lib/textEditBox";
describe("formStore", () => {
  beforeEach(() => {
    useFormStore.getState().clearFormState();
  });

  it("validates required fields", () => {
    const store = useFormStore.getState();
    store.setFieldValue("name", "", "text");
    useFormStore.setState((s) => ({
      values: { ...s.values, name: { ...s.values.name, name: "name", required: true } },
    }));

    expect(useFormStore.getState().validateRequired()).toBe(false);
    expect(useFormStore.getState().validationErrors.name).toBeTruthy();

    useFormStore.getState().setFieldValue("name", "Jane", "text");
    expect(useFormStore.getState().validateRequired()).toBe(true);
  });

  it("tracks newly created fields", () => {
    useFormStore.getState().addNewField({
      pageIndex: 0,
      name: "Field1",
      kind: "text",
      x: 10,
      y: 10,
      width: 120,
      height: 20,
      defaultValue: "",
      required: false,
      readOnly: false,
    });

    expect(useFormStore.getState().newFields).toHaveLength(1);
  });

  it("updates new field size", () => {
    useFormStore.getState().addNewField({
      pageIndex: 0,
      name: "Field1",
      kind: "dropdown",
      x: 10,
      y: 20,
      width: 100,
      height: 24,
      defaultValue: "Option 1",
      required: false,
      readOnly: false,
      options: ["Option 1", "Option 2"],
    });
    const id = useFormStore.getState().newFields[0]!.id;
    const normalizedHeight = layoutDropdownFromDrag(32).height;
    useFormStore.getState().updateNewFieldSize(id, 180, normalizedHeight);
    const field = useFormStore.getState().newFields[0];
    expect(field?.width).toBe(180);
    expect(field?.height).toBe(normalizedHeight);
  });

  it("updates new field position", () => {
    useFormStore.getState().addNewField({
      pageIndex: 0,
      name: "Field1",
      kind: "text",
      x: 10,
      y: 20,
      width: 100,
      height: 24,
      defaultValue: "",
      required: false,
      readOnly: false,
    });
    const id = useFormStore.getState().newFields[0]!.id;
    useFormStore.getState().updateNewFieldPosition(id, 50, 80);
    const field = useFormStore.getState().newFields[0];
    expect(field?.x).toBe(50);
    expect(field?.y).toBe(80);
  });

  it("renames a new field and migrates its value entry", () => {
    useFormStore.getState().addNewField({
      pageIndex: 0,
      name: "Field1",
      kind: "text",
      x: 10,
      y: 20,
      width: 100,
      height: 24,
      defaultValue: "",
      required: false,
      readOnly: false,
    });
    useFormStore.getState().setFieldValue("Field1", "Hello", "text");
    const id = useFormStore.getState().newFields[0]!.id;

    expect(useFormStore.getState().renameNewField(id, "CustomerName")).toBe(true);
    expect(useFormStore.getState().newFields[0]?.name).toBe("CustomerName");
    expect(useFormStore.getState().values.CustomerName?.value).toBe("Hello");
    expect(useFormStore.getState().values.Field1).toBeUndefined();
  });

  it("updates new field dropdown options", () => {
    useFormStore.getState().addNewField({
      pageIndex: 0,
      name: "Field1",
      kind: "dropdown",
      x: 10,
      y: 20,
      width: 100,
      height: 24,
      defaultValue: "Option 1",
      required: false,
      readOnly: false,
      options: ["Option 1", "Option 2"],
    });
    const id = useFormStore.getState().newFields[0]!.id;
    useFormStore.getState().updateNewField(id, { options: ["Red", "Green", "Blue"] });
    expect(useFormStore.getState().newFields[0]?.options).toEqual(["Red", "Green", "Blue"]);
    expect(useFormStore.getState().values.Field1?.value).toBe("Red");
  });

  it("preserves dropdown selection by index when option labels change", () => {
    useFormStore.getState().addNewField({
      pageIndex: 0,
      name: "Field1",
      kind: "dropdown",
      x: 10,
      y: 20,
      width: 100,
      height: 24,
      defaultValue: "Option 1",
      required: false,
      readOnly: false,
      options: ["Option 1", "Option 2"],
    });
    const id = useFormStore.getState().newFields[0]!.id;
    useFormStore.getState().setFieldValue("Field1", "Option 2", "dropdown");
    useFormStore.getState().updateNewField(id, { options: ["Apple", "Banana"] });
    expect(useFormStore.getState().values.Field1?.value).toBe("Banana");
  });

  it("tracks pending changes against baseline values", () => {
    useFormStore.getState().setValuesFromPdf({
      name: { name: "name", value: "Jane", type: "text" },
    });
    expect(useFormStore.getState().hasPendingFormChanges()).toBe(false);

    useFormStore.getState().setFieldValue("name", "John", "text");
    expect(useFormStore.getState().hasPendingFormChanges()).toBe(true);
    expect(useFormStore.getState().getChangedValuesArray()).toHaveLength(1);
  });

  it("marks values saved after baseline update", () => {
    useFormStore.getState().setValuesFromPdf({
      name: { name: "name", value: "Jane", type: "text" },
    });
    useFormStore.getState().setFieldValue("name", "John", "text");
    useFormStore.getState().markValuesSaved();
    expect(useFormStore.getState().hasPendingFormChanges()).toBe(false);
  });
});
