const POINTER_DRAG_EVENTS = {
  start: "pointerdown",
  move: "pointermove",
  end: "pointerup",
  cancel: "pointercancel",
};

const MOUSE_DRAG_EVENTS = {
  start: "mousedown",
  move: "mousemove",
  end: "mouseup",
  cancel: null,
};

export function createDraggableSurface({
  handle,
  ownerWindow = globalThis.window,
  shouldStart = () => true,
  onStart = () => {},
  onMove = () => {},
  onEnd = () => {},
}) {
  const dragEvents = getDragEvents(ownerWindow);
  let activeDrag = false;

  handle.addEventListener(dragEvents.start, handleStart);

  function destroy() {
    handle.removeEventListener(dragEvents.start, handleStart);
    endDrag(null);
  }

  function handleStart(event) {
    if (activeDrag || !isPrimaryDragEvent(event) || !shouldStart(event)) {
      return;
    }

    activeDrag = true;
    ownerWindow.addEventListener(dragEvents.move, handleMove, true);
    ownerWindow.addEventListener(dragEvents.end, handleEnd, true);
    if (dragEvents.cancel) {
      ownerWindow.addEventListener(dragEvents.cancel, handleEnd, true);
    }
    event.preventDefault();
    onStart(event);
  }

  function handleMove(event) {
    if (!activeDrag) {
      return;
    }

    event.preventDefault();
    onMove(event);
  }

  function handleEnd(event) {
    endDrag(event);
  }

  function endDrag(event) {
    if (!activeDrag) {
      return;
    }

    activeDrag = false;
    ownerWindow.removeEventListener(dragEvents.move, handleMove, true);
    ownerWindow.removeEventListener(dragEvents.end, handleEnd, true);
    if (dragEvents.cancel) {
      ownerWindow.removeEventListener(dragEvents.cancel, handleEnd, true);
    }
    onEnd(event);
  }

  return {
    destroy,
  };
}

function getDragEvents(ownerWindow) {
  return typeof ownerWindow.PointerEvent === "function"
    ? POINTER_DRAG_EVENTS
    : MOUSE_DRAG_EVENTS;
}

function isPrimaryDragEvent(event) {
  return event.button === 0 && event.isPrimary !== false;
}
