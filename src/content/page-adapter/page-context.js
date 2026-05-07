import {
  getSafeLocation,
  resolveMutationRoot,
} from "./dom.js";
import { createPageMutationObservation } from "./mutation-observation.js";
import { createPageNavigationObservation } from "./navigation-observation.js";
import { findEmbeddedIdFrame } from "./page-dom-queries.js";

export function createPageContext({
  hashTarget,
  viewportDocument,
  onChange,
  onStructureMutation = onChange,
  onContextRetarget = () => {},
}) {
  // TODO(smell): Page-context tracking owns iframe retargeting, mutation
  // observation coordination, and navigation observation coordination. Those
  // are all browser-integration seams; keep domain logic out of this layer.
  const mutationObservation = createPageMutationObservation({
    onMutation: onStructureMutation,
    onObservedRootChanged: onContextRetarget,
  });
  const navigationObservation = createPageNavigationObservation({
    onNavigation: onChange,
  });

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

  function start() {
    mutationObservation.start();
    syncObservedContext();
  }

  function syncObservedContext() {
    const context = getActiveMapContext();
    const mutationRoot = resolveMutationRoot(context.viewportDocument);
    mutationObservation.observeRoot(mutationRoot);
    navigationObservation.observeWindow(context.mapWindow);
  }

  function destroy() {
    navigationObservation.destroy();
    mutationObservation.destroy();
  }

  return {
    isSupported,
    getActiveMapContext,
    start,
    syncObservedContext,
    destroy,
  };
}
