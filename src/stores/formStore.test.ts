import { describe, expect, it, beforeEach } from "vitest";
import { useFormStore } from "./formStore";

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
});
