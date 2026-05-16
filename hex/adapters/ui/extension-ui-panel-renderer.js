import {
  createPanelAdapter,
} from "./panel-adapter.js";
import {
  createPanelViewportPositioner,
} from "./panel-viewport-positioner.js";

export function createExtensionPanelRenderer({
  document,
  eventDebugLogger = null,
}) {
  let positioner = null;

  return {
    renderPanel({
      root,
      panelChrome,
      view,
      dispatchCommand = () => {},
      dispatchPanelChromeChange = () => {},
    }) {
      applyPanelChrome({
        panel: root.panel,
        panelChrome,
      });
      bindPanelPositioner({
        ownerWindow: document.defaultView,
        panel: root.panel,
        eventDebugLogger,
      });
      positioner?.setPreferredScreenPx(panelChrome?.position?.screenPx ?? null);
      const panelSignature = panelRenderSignature(view);
      if (root.panelRenderSignature === panelSignature) {
        return;
      }
      const panelAdapter = createPanelAdapter({
        document,
        emitCommand: dispatchCommand,
        writePanelPosition(position) {
          dispatchPanelChromeChange({
            position,
          });
        },
        eventDebugLogger,
      });
      root.panel.replaceChildren(panelAdapter.render(view));
      root.panelRenderSignature = panelSignature;
    },
    destroy() {
      positioner?.destroy();
      positioner = null;
    },
  };

  function bindPanelPositioner({
    ownerWindow,
    panel,
    eventDebugLogger,
  }) {
    if (!ownerWindow) {
      return;
    }
    if (!positioner) {
      positioner = createPanelViewportPositioner({
        ownerWindow,
        panel,
        eventDebugLogger,
      });
      return;
    }
    positioner.setPanel(panel);
  }
}

function applyPanelChrome({
  panel,
  panelChrome,
}) {
  if (!panelChrome?.position?.screenPx) {
    return;
  }
  panel.style.left = `${panelChrome.position.screenPx.x}px`;
  panel.style.top = `${panelChrome.position.screenPx.y}px`;
  panel.style.right = "auto";
  panel.style.bottom = "auto";
}

function panelRenderSignature(view) {
  return JSON.stringify({
    primaryAction: view.primaryAction,
    modeSwitch: view.modeSwitch,
    history: view.history,
    opacityControl: view.opacityControl ?? null,
    status: view.status,
  });
}
