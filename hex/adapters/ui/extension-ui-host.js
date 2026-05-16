import {
  mountExtensionUiRoot,
} from "./extension-ui-root.js";
import {
  createExtensionOverlayRenderer,
} from "./extension-ui-overlay-renderer.js";
import {
  createExtensionPanelRenderer,
} from "./extension-ui-panel-renderer.js";

export function createExtensionUiHost({
  document,
  displayImageResourcePort = null,
  eventDebugLogger = null,
}) {
  const overlayRenderer = createExtensionOverlayRenderer({
    document,
    displayImageResourcePort,
    eventDebugLogger,
  });
  const panelRenderer = createExtensionPanelRenderer({
    document,
    eventDebugLogger,
  });

  return {
    mountOwnedRoot(id) {
      return mountExtensionUiRoot({
        document,
        id,
        eventDebugLogger,
        onDispose() {
          overlayRenderer.destroy();
        },
      });
    },
    renderApplicationView({
      root,
      panelChrome,
      view,
      dispatchCommand = () => {},
      dispatchPanelChromeChange = () => {},
      emitInteractionFact = () => {},
      dispatchInteractionFact = emitInteractionFact,
    }) {
      overlayRenderer.renderOverlay({
        root,
        view,
        dispatchInteractionFact,
      });
      panelRenderer.renderPanel({
        root,
        panelChrome,
        view,
        dispatchCommand,
        dispatchPanelChromeChange,
      });
    },
  };
}
