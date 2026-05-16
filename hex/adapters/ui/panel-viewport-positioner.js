import {
  resolvePanelPosition,
} from "./panel-position-adapter.js";

export function createPanelViewportPositioner({
  ownerWindow,
  panel,
  eventDebugLogger = null,
}) {
  let panelElement = panel;
  let preferredScreenPx = null;

  ownerWindow?.addEventListener("resize", sync);

  return {
    setPanel(nextPanel) {
      panelElement = nextPanel;
      sync();
    },
    setPreferredScreenPx(nextPreferredScreenPx) {
      preferredScreenPx = isFinitePoint(nextPreferredScreenPx) ? nextPreferredScreenPx : null;
      sync();
    },
    destroy() {
      ownerWindow?.removeEventListener("resize", sync);
      panelElement = null;
      preferredScreenPx = null;
    },
  };

  function sync() {
    if (!ownerWindow || !panelElement || !preferredScreenPx) {
      return;
    }
    const rect = panelElement.getBoundingClientRect?.();
    if (!rect) {
      return;
    }
    const position = {
      requestedScreenPx: preferredScreenPx,
      panelSizePx: {
        width: rect.width,
        height: rect.height,
      },
      viewportPx: {
        width: ownerWindow.innerWidth,
        height: ownerWindow.innerHeight,
      },
    };
    const resolved = resolvePanelPosition(position);
    panelElement.style.left = `${resolved.x}px`;
    panelElement.style.top = `${resolved.y}px`;
    panelElement.style.right = "auto";
    panelElement.style.bottom = "auto";
    if (
      resolved.x !== preferredScreenPx.x
      || resolved.y !== preferredScreenPx.y
    ) {
      eventDebugLogger?.log("panel.render", "viewport-clamped-position", {
        requestedScreenPx: preferredScreenPx,
        renderedScreenPx: resolved,
        panelSizePx: position.panelSizePx,
        viewportPx: position.viewportPx,
      });
    }
  }
}

function isFinitePoint(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.y);
}
