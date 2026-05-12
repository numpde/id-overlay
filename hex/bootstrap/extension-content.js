import { bootstrapBrowserExtension } from "./index.js";
import {
  createStoragePortAdapter,
} from "../adapters/extension/storage-port.js";
import { createExtensionUiHost } from "../adapters/ui/extension-ui-host.js";
import {
  createActiveMapContextAdapter,
} from "../adapters/page-osm-id/active-map-context-adapter.js";
import {
  createTimerPortAdapter,
} from "../adapters/web/timer-port.js";
import {
  createBrowserReferenceImageInputPort,
} from "../adapters/web/reference-image-input-port.js";

const DURABLE_STATE_STORAGE_KEY = "id-overlay/state";

export async function startExtensionContent({
  location,
  document = globalThis.document,
  findEmbeddedEditorFrame = () => null,
  mountOwnedRoot,
  ownerWindow = globalThis.window,
  referenceImageInputPort = createBrowserReferenceImageInputPort({
    ownerWindow,
  }),
  renderApplicationView,
  startRuntime = (runtime) => runtime,
  storageArea = globalThis.chrome?.storage?.local,
  storageKey = DURABLE_STATE_STORAGE_KEY,
  setTimer = globalThis.setTimeout?.bind(globalThis),
  clearTimer = globalThis.clearTimeout?.bind(globalThis),
}) {
  const uiHost = createExtensionUiHost({
    document,
  });
  const pageContext = createActiveMapContextAdapter({
    readLocation: () => ({
      origin: location.origin,
      pathname: location.pathname,
      search: location.search,
    }),
    findEmbeddedEditorFrame,
  }).readActiveMapContext();

  return bootstrapBrowserExtension({
    pageContext,
    durableStatePort: createDurableStatePort({
      storageArea,
      storageKey,
    }),
    timerPort: createTimerPort({
      setTimer,
      clearTimer,
    }),
    referenceImageInputPort,
    mountOwnedRoot: mountOwnedRoot ?? uiHost.mountOwnedRoot,
    renderApplicationView: renderApplicationView ?? uiHost.renderApplicationView,
    startRuntime,
  });
}

function createDurableStatePort({ storageArea, storageKey }) {
  if (!storageArea) {
    return {
      async readDurableState() {
        return null;
      },
      async writeDurableState() {},
    };
  }
  return createStoragePortAdapter({
    storageArea,
    storageKey,
  });
}

function createTimerPort({ setTimer, clearTimer }) {
  if (!setTimer || !clearTimer) {
    return undefined;
  }
  return createTimerPortAdapter({
    setTimer,
    clearTimer,
  });
}
