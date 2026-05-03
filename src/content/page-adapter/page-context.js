import {
  findEmbeddedIdFrame,
  getSafeLocation,
  resolveMutationRoot,
} from "./dom.js";

export function createPageContext({
  hashTarget,
  viewportDocument,
  onChange,
  onStructureMutation = onChange,
  onContextRetarget = () => {},
}) {
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
      restoreHistoryMethods = patchHistoryMethods({
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

function patchHistoryMethods({ hashTarget, onHistoryMutation }) {
  const history = hashTarget.history;
  if (!history) {
    return null;
  }

  const originalReplaceState = typeof history.replaceState === "function"
    ? history.replaceState.bind(history)
    : null;
  const originalPushState = typeof history.pushState === "function"
    ? history.pushState.bind(history)
    : null;

  if (!originalReplaceState && !originalPushState) {
    return null;
  }

  if (originalReplaceState) {
    history.replaceState = function patchedReplaceState(...args) {
      const result = originalReplaceState(...args);
      onHistoryMutation();
      return result;
    };
  }

  if (originalPushState) {
    history.pushState = function patchedPushState(...args) {
      const result = originalPushState(...args);
      onHistoryMutation();
      return result;
    };
  }

  return () => {
    if (originalReplaceState) {
      history.replaceState = originalReplaceState;
    }
    if (originalPushState) {
      history.pushState = originalPushState;
    }
  };
}
