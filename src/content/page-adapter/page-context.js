import { createActiveMapContextResolver } from "./active-map-context.js";
import { resolveMutationRoot } from "./dom.js";
import { createPageMutationObservation } from "./mutation-observation.js";
import { createPageNavigationObservation } from "./navigation-observation.js";

export const PAGE_CONTEXT_EVENT = Object.freeze({
  CHANGE: "change",
  STRUCTURE_MUTATION: "structure-mutation",
  CONTEXT_RETARGET: "context-retarget",
});

export function createPageContext({
  hashTarget,
  viewportDocument,
}) {
  const listeners = new Set();
  const activeMapContext = createActiveMapContextResolver({
    hashTarget,
    viewportDocument,
  });
  const mutationObservation = createPageMutationObservation({
    onMutation: () => emit({ type: PAGE_CONTEXT_EVENT.STRUCTURE_MUTATION }),
    onObservedRootChanged: (root) => emit({
      type: PAGE_CONTEXT_EVENT.CONTEXT_RETARGET,
      root,
    }),
  });
  const navigationObservation = createPageNavigationObservation({
    onNavigation: () => emit({ type: PAGE_CONTEXT_EVENT.CHANGE }),
  });

  function subscribe(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function start() {
    mutationObservation.start();
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

  function emit(event) {
    for (const listener of listeners) {
      listener(event);
    }
  }

  return {
    isSupported: activeMapContext.isSupported,
    getActiveMapContext: activeMapContext.getActiveMapContext,
    subscribe,
    start,
    syncObservedContext,
    destroy,
  };
}
