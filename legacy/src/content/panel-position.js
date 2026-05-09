const PANEL_MARGIN_PX = 8;
const PANEL_FALLBACK_WIDTH_PX = 280;
const PANEL_FALLBACK_HEIGHT_PX = 200;

export function capturePanelPosition({ root, ownerWindow }) {
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

export function applyPanelPosition(root, panelPosition) {
  // TODO(smell): Position persistence is intentionally absent. If panel position
  // becomes durable, model it as an explicit UI preference service outside the
  // machine state.
  root.style.left = `${panelPosition.left}px`;
  root.style.top = `${panelPosition.top}px`;
  root.style.right = "auto";
  root.style.bottom = "auto";
}

export function clampPanelPosition({ root, ownerWindow, position }) {
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
