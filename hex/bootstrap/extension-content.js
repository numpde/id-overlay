import { bootstrapBrowserExtension } from "./index.js";
import {
  createActiveMapContextAdapter,
} from "../adapters/page-osm-id/active-map-context-adapter.js";

export async function startExtensionContent({
  location,
  findEmbeddedEditorFrame = () => null,
  mountOwnedRoot = () => {},
  startRuntime = (runtime) => runtime,
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
    mountOwnedRoot,
    startRuntime,
  });
}
