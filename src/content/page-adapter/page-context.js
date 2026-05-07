import {
  findEmbeddedIdFrame,
  getSafeLocation,
  resolveMutationRoot,
} from "./dom.js";
import { observeHistoryMutations } from "./history-observation.js";

export function createPageContext({
  hashTarget,
  viewportDocument,
  onChange,
  onStructureMutation = onChange,
  onContextRetarget = () => {},
}) {
  // TODO(smell): Page-context tracking owns iframe retargeting, mutation
  // observation, and history patching. Those are all browser-integration seams;
  // keep domain logic out of this layer.
  let mutationObserver = null;
  let restoreHistoryMethods = null;
  let observedMapWindow = null;
  let observedMutationRoot = null;

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
    if (mutationObserver) {
      return;
    }
    mutationObserver = new MutationObserver(onStructureMutation);
    syncObservedContext();
  }

  function syncObservedContext() {
    const context = getActiveMapContext();
    const mutationRoot = resolveMutationRoot(context.viewportDocument);
    if (observedMutationRoot !== mutationRoot) {
      mutationObserver?.disconnect();
      mutationObserver?.observe(mutationRoot, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class", "style", "src"],
      });
      observedMutationRoot = mutationRoot;
      onContextRetarget();
    }

    if (observedMapWindow === context.mapWindow) {
      return;
    }

    detachObservedMapWindow();
    observedMapWindow = context.mapWindow;
    if (observedMapWindow) {
      observedMapWindow.addEventListener("hashchange", onChange);
      observedMapWindow.addEventListener("popstate", onChange);
      restoreHistoryMethods = observeHistoryMutations({
        hashTarget: observedMapWindow,
        onHistoryMutation: onChange,
      });
    }
  }

  function destroy() {
    detachObservedMapWindow();
    observedMutationRoot = null;
    mutationObserver?.disconnect();
    mutationObserver = null;
  }

  function detachObservedMapWindow() {
    restoreHistoryMethods?.();
    restoreHistoryMethods = null;
    if (observedMapWindow) {
      observedMapWindow.removeEventListener("hashchange", onChange);
      observedMapWindow.removeEventListener("popstate", onChange);
    }
    observedMapWindow = null;
  }

  return {
    isSupported,
    getActiveMapContext,
    start,
    syncObservedContext,
    destroy,
  };
}
