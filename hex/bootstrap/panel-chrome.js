import {
  resolvePanelPosition,
} from "../adapters/ui/panel-position-adapter.js";

export async function readPanelChrome({ host, reportHostError }) {
  try {
    return normalizeStoredPanelChrome({
      storedChrome: await host.panelChromePort?.readPanelChrome?.(),
      host,
    });
  } catch (error) {
    reportHostError(host, error);
    return normalizeStoredPanelChrome({
      storedChrome: null,
      host,
    });
  }
}

export function normalizePanelChrome({ position }) {
  return {
    position: {
      screenPx: resolvePanelPosition(position),
    },
  };
}

function normalizeStoredPanelChrome({ storedChrome, host }) {
  return normalizePanelChrome({
    position: {
      requestedScreenPx: storedChrome?.position?.screenPx ?? {
        x: 16,
        y: 16,
      },
      panelSizePx: host.panelSizePx ?? {
        width: 240,
        height: 120,
      },
      viewportPx: host.pageViewportPx ?? {
        width: 800,
        height: 600,
      },
    },
  });
}
