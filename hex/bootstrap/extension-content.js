import { bootstrapBrowserExtension } from "./index.js";
import {
  createStoragePortAdapter,
} from "../adapters/extension/storage-port.js";
import {
  createActiveMapContextAdapter,
} from "../adapters/page-osm-id/active-map-context-adapter.js";

const DURABLE_STATE_STORAGE_KEY = "id-overlay/state";

export async function startExtensionContent({
  location,
  findEmbeddedEditorFrame = () => null,
  mountOwnedRoot = () => {},
  startRuntime = (runtime) => runtime,
  storageArea = globalThis.chrome?.storage?.local,
  storageKey = DURABLE_STATE_STORAGE_KEY,
}) {
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
    mountOwnedRoot,
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
