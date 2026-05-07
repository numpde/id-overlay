import { observeHistoryMutations } from "./history-observation.js";

export function createPageNavigationObservation({
  onNavigation,
  observeHistory = observeHistoryMutations,
}) {
  let observedWindow = null;
  let restoreHistoryMethods = null;

  function observeWindow(mapWindow) {
    if (observedWindow === mapWindow) {
      return;
    }
    detachObservedWindow();
    observedWindow = mapWindow;
    if (!observedWindow) {
      return;
    }
    observedWindow.addEventListener("hashchange", onNavigation);
    observedWindow.addEventListener("popstate", onNavigation);
    restoreHistoryMethods = observeHistory({
      hashTarget: observedWindow,
      onHistoryMutation: onNavigation,
    });
  }

  function destroy() {
    detachObservedWindow();
  }

  function detachObservedWindow() {
    restoreHistoryMethods?.();
    restoreHistoryMethods = null;
    if (observedWindow) {
      observedWindow.removeEventListener("hashchange", onNavigation);
      observedWindow.removeEventListener("popstate", onNavigation);
    }
    observedWindow = null;
  }

  return {
    observeWindow,
    destroy,
  };
}
