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
  let resizeObserver = null;

  ownerWindow?.addEventListener("resize", syncSmooth);
  observePanel();

  return {
    setPanel(nextPanel) {
      unobservePanel();
      panelElement = nextPanel;
      observePanel();
      syncSmooth();
    },
    setPreferredScreenPx(nextPreferredScreenPx) {
      preferredScreenPx = isFinitePoint(nextPreferredScreenPx) ? nextPreferredScreenPx : null;
      syncDirect();
    },
    syncAfterContentChange({ smooth = true } = {}) {
      sync({
        motion: smooth ? "smooth" : "direct",
      });
    },
    destroy() {
      ownerWindow?.removeEventListener("resize", syncSmooth);
      unobservePanel();
      panelElement = null;
      preferredScreenPx = null;
    },
  };

  function syncDirect() {
    sync({
      motion: "direct",
    });
  }

  function syncSmooth() {
    sync({
      motion: "smooth",
    });
  }

  function sync({ motion }) {
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
    panelElement.dataset.idOverlayPanelMotion = motion;
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

  function observePanel() {
    const ResizeObserver = ownerWindow?.ResizeObserver;
    if (!panelElement || typeof ResizeObserver !== "function") {
      return;
    }
    resizeObserver = new ResizeObserver(syncSmooth);
    resizeObserver.observe(panelElement);
  }

  function unobservePanel() {
    resizeObserver?.disconnect?.();
    resizeObserver = null;
  }
}

function isFinitePoint(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.y);
}
