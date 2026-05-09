import {
  applyPanelPosition,
  capturePanelPosition,
  clampPanelPosition,
} from "./panel-position.js";
import { createDraggableSurface } from "./draggable-surface.js";

const PANEL_DRAG_EXCLUDED_SELECTOR = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "[contenteditable]",
  "[data-id-overlay-panel-drag-excluded=\"true\"]",
].join(",");

export function createPanelDragController({
  root,
  handle,
  ownerWindow = globalThis.window,
}) {
  let panelPosition = capturePanelPosition({ root, ownerWindow });
  let activePanelDrag = null;
  const dragSurface = createDraggableSurface({
    handle,
    ownerWindow,
    shouldStart: shouldStartPanelDrag,
    onStart: startPanelDrag,
    onMove: movePanelDrag,
    onEnd: endPanelDrag,
  });

  applyPanelPosition(root, panelPosition);
  ownerWindow.addEventListener("resize", handleWindowResize);

  function destroy() {
    dragSurface.destroy();
    ownerWindow.removeEventListener("resize", handleWindowResize);
  }

  function startPanelDrag(event) {
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
  }

  function movePanelDrag(event) {
    if (!activePanelDrag) {
      return;
    }

    setPanelPosition({
      left: event.clientX - activePanelDrag.offsetX,
      top: event.clientY - activePanelDrag.offsetY,
    });
  }

  function endPanelDrag() {
    if (!activePanelDrag) {
      return;
    }

    activePanelDrag = null;
    root.classList.remove("id-overlay-panel--dragging");
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

function shouldStartPanelDrag(event) {
  return !event.target?.closest?.(PANEL_DRAG_EXCLUDED_SELECTOR);
}
