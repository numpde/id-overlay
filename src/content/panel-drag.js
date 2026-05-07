const PANEL_MARGIN_PX = 8;
const PANEL_FALLBACK_WIDTH_PX = 280;
const PANEL_FALLBACK_HEIGHT_PX = 200;

export function createPanelDragController({
  root,
  handle,
  ownerWindow = globalThis.window,
}) {
  // TODO(smell): Panel position is local transient UI state, separate from the
  // machine. That is acceptable, but the controller mixes drag lifecycle,
  // clamping policy, and style patching in one file.
  let panelPosition = captureInitialPanelPosition({ root, ownerWindow });
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

function captureInitialPanelPosition({ root, ownerWindow }) {
  const rect = root.getBoundingClientRect();
  return clampPanelPosition({
    root,
    ownerWindow,
    position: {
      left: Number.isFinite(rect.left) ? rect.left : PANEL_MARGIN_PX,
      top: Number.isFinite(rect.top) ? rect.top : PANEL_MARGIN_PX,
    },
  });
}

function applyPanelPosition(root, panelPosition) {
  // TODO(smell): Position persistence is intentionally absent. If panel position
  // becomes durable, do not hide it here; model it as an explicit UI preference
  // service outside the machine state.
  root.style.left = `${panelPosition.left}px`;
  root.style.top = `${panelPosition.top}px`;
  root.style.right = "auto";
  root.style.bottom = "auto";
}

function clampPanelPosition({ root, ownerWindow, position }) {
  const rect = root.getBoundingClientRect();
  const panelWidth = rect.width || root.offsetWidth || readCssPixelVariable(
    root,
    ownerWindow,
    "--id-overlay-panel-width",
    PANEL_FALLBACK_WIDTH_PX,
  );
  const panelHeight = rect.height || root.offsetHeight || PANEL_FALLBACK_HEIGHT_PX;
  const maxLeft = Math.max(PANEL_MARGIN_PX, ownerWindow.innerWidth - panelWidth - PANEL_MARGIN_PX);
  const maxTop = Math.max(PANEL_MARGIN_PX, ownerWindow.innerHeight - panelHeight - PANEL_MARGIN_PX);
  return {
    left: clampNumber(position.left, PANEL_MARGIN_PX, maxLeft),
    top: clampNumber(position.top, PANEL_MARGIN_PX, maxTop),
  };
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function readCssPixelVariable(element, ownerWindow, name, fallbackValue) {
  const value = Number.parseFloat(
    ownerWindow.getComputedStyle(element).getPropertyValue(name),
  );
  return Number.isFinite(value) ? value : fallbackValue;
}
