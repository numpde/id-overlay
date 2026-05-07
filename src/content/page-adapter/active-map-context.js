import { getSafeLocation } from "./dom.js";
import { findEmbeddedIdFrame } from "./page-dom-queries.js";

export function createActiveMapContextResolver({
  hashTarget,
  viewportDocument,
}) {
  function isSupported() {
    const location = getSafeLocation(hashTarget);
    return location.origin === "https://www.openstreetmap.org" &&
      location.pathname.startsWith("/edit");
  }

  function getActiveMapContext() {
    const embedFrame = findEmbeddedIdFrame(viewportDocument);
    if (embedFrame) {
      return {
        mapWindow: embedFrame.contentWindow,
        viewportDocument: embedFrame.contentDocument,
        frameElement: embedFrame,
      };
    }
    return {
      mapWindow: hashTarget,
      viewportDocument,
      frameElement: null,
    };
  }

  return {
    isSupported,
    getActiveMapContext,
  };
}
