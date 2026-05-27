import { beforeEach, describe, expect, it } from "vitest";
import {
  applyEditSnapshot,
  captureEditSnapshot,
  snapshotsEqual,
} from "./history";
import { useAnnotationStore } from "@/stores/annotationStore";
import { useContentEditStore } from "@/stores/contentEditStore";
import { useFormStore } from "@/stores/formStore";

describe("edit history snapshots", () => {
  beforeEach(() => {
    useAnnotationStore.setState({ annotations: [], selectedId: null });
    useContentEditStore.getState().clearEdits();
    useFormStore.getState().clearFormState();
  });

  it("capture and apply round-trip annotations and form state", () => {
    useFormStore.getState().setFieldValue("email", "a@b.com", "text");
    useFormStore.getState().addNewField({
      pageIndex: 0,
      name: "Field1",
      kind: "text",
      x: 1,
      y: 2,
      width: 100,
      height: 20,
      defaultValue: "",
      required: false,
      readOnly: false,
    });

    const snap = captureEditSnapshot();
    useFormStore.getState().clearFormState();
    applyEditSnapshot(snap);

    expect(useFormStore.getState().values.email?.value).toBe("a@b.com");
    expect(useFormStore.getState().newFields).toHaveLength(1);
  });

  it("snapshotsEqual detects identical snapshots", () => {
    const a = captureEditSnapshot();
    const b = captureEditSnapshot();
    expect(snapshotsEqual(a, b)).toBe(true);
  });

  it("snapshotsEqual detects changes", () => {
    const a = captureEditSnapshot();
    useFormStore.getState().setFieldValue("x", "1", "text");
    const b = captureEditSnapshot();
    expect(snapshotsEqual(a, b)).toBe(false);
  });
});
