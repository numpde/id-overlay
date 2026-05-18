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
  hotPathWatchdog = null,
  readModifierKeyEventTargets = () => [],
}) {
  const overlayRenderer = createExtensionOverlayRenderer({
    document,
    displayImageResourcePort,
    eventDebugLogger,
    readModifierKeyEventTargets,
  });
  const panelRenderer = createExtensionPanelRenderer({
    document,
    eventDebugLogger,
    hotPathWatchdog,
  });

  return {
    mountOwnedRoot(id) {
      return mountExtensionUiRoot({
        document,
        id,
        eventDebugLogger,
        onDispose() {
          overlayRenderer.destroy();
          panelRenderer.destroy();
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
        previewOpacity(opacity) {
          overlayRenderer.previewOpacity({
            opacity,
          });
        },
      });
    },
  };
}
