export function resolvePanelPosition({
  requestedScreenPx,
  panelSizePx,
  viewportPx,
}) {
  return {
    x: clampCoordinate(
      requestedScreenPx.x,
      viewportPx.width - panelSizePx.width,
    ),
    y: clampCoordinate(
      requestedScreenPx.y,
      viewportPx.height - panelSizePx.height,
    ),
  };
}

function clampCoordinate(value, maxValue) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), Math.max(maxValue, 0));
}
