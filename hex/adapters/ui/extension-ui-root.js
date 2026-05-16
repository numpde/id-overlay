import {
  createEventDebugProbe,
} from "./event-debug-log.js";
import {
  EXTENSION_UI_STYLES,
} from "./extension-ui-styles.js";

export function mountExtensionUiRoot({
  document,
  id,
  eventDebugLogger = null,
  onDispose = () => {},
}) {
  const hostElement = document.createElement("div");
  hostElement.id = id;
  const shadowRoot = hostElement.attachShadow({
    mode: "open",
  });
  const style = document.createElement("style");
  style.textContent = EXTENSION_UI_STYLES;
  const overlay = document.createElement("div");
  overlay.dataset.region = "overlay";
  const panel = document.createElement("div");
  panel.dataset.region = "panel";
  shadowRoot.append(style, overlay, panel);
  document.body.append(hostElement);

  const eventDebugProbe = createEventDebugProbe({
    ownerWindow: document.defaultView,
    document,
    root: {
      hostElement,
      shadowRoot,
      overlay,
      panel,
    },
    logger: eventDebugLogger,
  });

  return {
    hostElement,
    shadowRoot,
    overlay,
    panel,
    eventDebugProbe,
    dispose() {
      onDispose();
      eventDebugProbe.destroy();
      hostElement.remove();
    },
  };
}
