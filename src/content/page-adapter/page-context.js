import { createActiveMapContextResolver } from "./active-map-context.js";
import { resolveMutationRoot } from "./dom.js";
import { createPageMutationObservation } from "./mutation-observation.js";
import { createPageNavigationObservation } from "./navigation-observation.js";

export function createPageContext({
  hashTarget,
  viewportDocument,
  onChange,
  onStructureMutation = onChange,
  onContextRetarget = () => {},
}) {
  const activeMapContext = createActiveMapContextResolver({
    hashTarget,
    viewportDocument,
  });
  const mutationObservation = createPageMutationObservation({
    onMutation: onStructureMutation,
    onObservedRootChanged: onContextRetarget,
  });
  const navigationObservation = createPageNavigationObservation({
    onNavigation: onChange,
  });

  function start() {
    mutationObservation.start();
    syncObservedContext();
  }

  function syncObservedContext() {
    const context = activeMapContext.getActiveMapContext();
    const mutationRoot = resolveMutationRoot(context.viewportDocument);
    mutationObservation.observeRoot(mutationRoot);
    navigationObservation.observeWindow(context.mapWindow);
  }

  function destroy() {
    navigationObservation.destroy();
    mutationObservation.destroy();
  }

  return {
    isSupported: activeMapContext.isSupported,
    getActiveMapContext: activeMapContext.getActiveMapContext,
    start,
    syncObservedContext,
    destroy,
  };
}
