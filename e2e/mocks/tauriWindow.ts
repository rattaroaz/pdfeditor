const noopUnlisten = async () => {};

export function getCurrentWindow() {
  return {
    onCloseRequested: async () => noopUnlisten,
    onDragDropEvent: async () => noopUnlisten,
    setFullscreen: async () => {},
    destroy: async () => {},
  };
}
