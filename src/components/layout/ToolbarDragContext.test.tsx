import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DraggableToolbarItem,
  ToolbarDragProvider,
} from "@/components/layout/ToolbarDragContext";
import { DEFAULT_TOOLBAR_ORDER } from "@/lib/toolbarOrder";
import { useUiStore } from "@/stores/uiStore";

function mockRect(el: HTMLElement, left: number, width: number) {
  el.getBoundingClientRect = () =>
    ({
      left,
      width,
      right: left + width,
      top: 0,
      bottom: 0,
      height: 0,
      x: left,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

function dispatchPointer(
  target: EventTarget,
  type: "pointerdown" | "pointermove" | "pointerup",
  clientX: number,
  clientY: number,
  pointerId = 1,
) {
  act(() => {
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
        button: 0,
        pointerId,
        pointerType: "mouse",
        isPrimary: true,
      }),
    );
  });
}

function TestToolbar() {
  return (
    <ToolbarDragProvider>
      <div data-toolbar-zone="toolbar" className="flex">
        <DraggableToolbarItem id="toolbar-modes">Modes</DraggableToolbarItem>
        <DraggableToolbarItem id="toolbar-sidebar">Sidebar</DraggableToolbarItem>
        <DraggableToolbarItem id="toolbar-undo-redo">Undo</DraggableToolbarItem>
      </div>
    </ToolbarDragProvider>
  );
}

describe("ToolbarDragContext", () => {
  beforeEach(() => {
    useUiStore.setState({
      toolbarOrder: [
        "toolbar-modes",
        "toolbar-sidebar",
        "toolbar-undo-redo",
        ...DEFAULT_TOOLBAR_ORDER.filter(
          (id) =>
            id !== "toolbar-modes" &&
            id !== "toolbar-sidebar" &&
            id !== "toolbar-undo-redo",
        ),
      ],
      toolbarDragFrom: null,
      toolbarDropBeforeId: null,
    });
  });

  it("activates drag state and reorders on pointer up", () => {
    render(<TestToolbar />);
    const modes = document.querySelector('[data-toolbar-id="toolbar-modes"]') as HTMLElement;
    const sidebar = document.querySelector('[data-toolbar-id="toolbar-sidebar"]') as HTMLElement;
    const undoRedo = document.querySelector('[data-toolbar-id="toolbar-undo-redo"]') as HTMLElement;
    mockRect(modes, 0, 100);
    mockRect(sidebar, 110, 80);
    mockRect(undoRedo, 200, 80);

    dispatchPointer(modes, "pointerdown", 10, 10);
    dispatchPointer(window, "pointermove", 170, 10);
    expect(useUiStore.getState().toolbarDragFrom).toBe("toolbar-modes");
    expect(useUiStore.getState().toolbarDropBeforeId).toBe("toolbar-undo-redo");

    dispatchPointer(window, "pointerup", 170, 10);

    expect(useUiStore.getState().toolbarOrder[0]).toBe("toolbar-sidebar");
    expect(useUiStore.getState().toolbarOrder[1]).toBe("toolbar-modes");
  });

  it("does not start drag from nested buttons", () => {
    render(
      <ToolbarDragProvider>
        <div data-toolbar-zone="toolbar">
          <DraggableToolbarItem id="toolbar-undo-redo">
            <button type="button">Undo</button>
          </DraggableToolbarItem>
        </div>
      </ToolbarDragProvider>,
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: "Undo" }), {
      clientX: 10,
      clientY: 10,
      button: 0,
      pointerId: 2,
    });
    fireEvent.pointerMove(window, { clientX: 200, clientY: 10, pointerId: 2 });
    fireEvent.pointerUp(window, { pointerId: 2 });

    expect(useUiStore.getState().toolbarDragFrom).toBeNull();
  });
});
