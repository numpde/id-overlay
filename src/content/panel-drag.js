import {
  applyPanelPosition,
  capturePanelPosition,
  clampPanelPosition,
} from "./panel-position.js";

export function createPanelDragController({
  root,
  handle,
  ownerWindow = globalThis.window,
}) {
  let panelPosition = capturePanelPosition({ root, ownerWindow });
  let activePanelDrag = null;

  applyPanelPosition(root, panelPosition);
  ownerWindow.addEventListener("resize", handleWindowResize);
  handle.addEventListener("mousedown", handlePanelDragStart);

  function destroy() {
    endPanelDrag();
    ownerWindow.removeEventListener("resize", handleWindowResize);
    handle.removeEventListener("mousedown", handlePanelDragStart);
  }

  function handlePanelDragStart(event) {
    // TODO(smell): This uses mouse-only document listeners while overlay input
    // has richer pointer sequencing. If panel drag grows, reuse a small generic
    // draggable primitive instead of extending this bespoke lifecycle.
    if (event.button !== 0) {
      return;
    }

    const rect = root.getBoundingClientRect();
    panelPosition = {
      left: rect.left,
      top: rect.top,
    };
    activePanelDrag = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    root.classList.add("id-overlay-panel--dragging");
    ownerWindow.addEventListener("mousemove", handlePanelDragMove, true);
    ownerWindow.addEventListener("mouseup", handlePanelDragEnd, true);
    event.preventDefault();
  }

  function handlePanelDragMove(event) {
    if (!activePanelDrag) {
      return;
    }

    setPanelPosition({
      left: event.clientX - activePanelDrag.offsetX,
      top: event.clientY - activePanelDrag.offsetY,
    });
    event.preventDefault();
  }

  function handlePanelDragEnd() {
    endPanelDrag();
  }

  function endPanelDrag() {
    if (!activePanelDrag) {
      return;
    }

    activePanelDrag = null;
    root.classList.remove("id-overlay-panel--dragging");
    ownerWindow.removeEventListener("mousemove", handlePanelDragMove, true);
    ownerWindow.removeEventListener("mouseup", handlePanelDragEnd, true);
  }

  function handleWindowResize() {
    setPanelPosition(panelPosition);
  }

  function setPanelPosition(nextPosition) {
    panelPosition = clampPanelPosition({
      root,
      ownerWindow,
      position: nextPosition,
    });
    applyPanelPosition(root, panelPosition);
  }

  return {
    destroy,
  };
}
