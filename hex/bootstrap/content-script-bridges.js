import {
  isSurfaceMotionPayload,
} from "../adapters/page-osm-id/page-dom-reader.js";
import {
  SURFACE_MOTION_EVENT_TYPE,
} from "../adapters/page-osm-id/page-observation-runtime.js";
import {
  createEventDebugLogger,
} from "../adapters/ui/event-debug-log.js";

const SURFACE_MOTION_BRIDGE_RESOURCE = "hex/bootstrap/surface-motion-page-bridge.js";
const DEBUG_CONSOLE_BRIDGE_RESOURCE = "hex/bootstrap/event-debug-console-bridge.js";

export function createContentEventDebugLogger({
  ownerWindow,
  chromeApi,
}) {
  const consoleBridgeUrl = extensionResourceUrl(chromeApi, DEBUG_CONSOLE_BRIDGE_RESOURCE);
  const eventDebugLogger = createEventDebugLogger({
    ownerWindow,
    consoleObject: consoleBridgeUrl ? null : undefined,
  });
  installPageScriptBridge({
    ownerWindow,
    url: consoleBridgeUrl,
    enabled: eventDebugLogger.enabled,
    dataAttribute: "idOverlayEventDebugConsoleBridge",
  });
  return eventDebugLogger;
}

export function installSurfaceMotionBridge({
  ownerWindow,
  chromeApi,
  onSurfaceMotion,
}) {
  ownerWindow.addEventListener("message", (event) => {
    if (
      event.data?.source !== "id-overlay"
        || event.data?.type !== SURFACE_MOTION_EVENT_TYPE
        || !isSurfaceMotionPayload(event.data.surfaceMotion)
    ) {
      return;
    }
    onSurfaceMotion(event.data.surfaceMotion);
  });
  ownerWindow.document?.addEventListener?.(SURFACE_MOTION_EVENT_TYPE, (event) => {
    if (!isSurfaceMotionPayload(event.detail)) {
      return;
    }
    onSurfaceMotion(event.detail);
  });
  installPageScriptBridge({
    ownerWindow,
    url: extensionResourceUrl(chromeApi, SURFACE_MOTION_BRIDGE_RESOURCE),
    enabled: true,
    dataAttribute: "idOverlaySurfaceMotionBridge",
  });
}

function installPageScriptBridge({
  ownerWindow,
  url,
  enabled,
  dataAttribute,
}) {
  if (!enabled || !url || !ownerWindow.document?.documentElement) {
    return;
  }
  const script = ownerWindow.document.createElement("script");
  script.src = url;
  script.async = false;
  script.dataset[dataAttribute] = "";
  ownerWindow.document.documentElement.append(script);
  script.remove();
}

function extensionResourceUrl(chromeApi, resourcePath) {
  return chromeApi?.runtime?.getURL?.(resourcePath) ?? null;
}
