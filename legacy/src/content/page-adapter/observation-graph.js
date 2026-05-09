import {
  PAGE_CONTEXT_EVENT,
  createPageContext,
} from "./page-context.js";
import { createPageSnapshotSource } from "./snapshot-source.js";
import { createPageSnapshotWatcher } from "./snapshot-watcher.js";

export function createPageObservationGraph({
  hashTarget,
  viewportDocument,
  viewportGeometry,
  mapViewResolver,
  runBoundary,
  createContext = createPageContext,
  createSnapshotSource = createPageSnapshotSource,
  createSnapshotWatcher = createPageSnapshotWatcher,
}) {
  const pageContext = createContext({
    hashTarget,
    viewportDocument,
  });
  const watcher = createSnapshotWatcher({
    hashTarget,
    onInvalidate: handleSnapshotInvalidation,
  });
  const snapshotSource = createSnapshotSource({
    hashTarget,
    pageContext,
    viewportGeometry,
    mapViewResolver,
    runBoundary,
    onFirstSubscriber: startObserving,
    onNoSubscribers: stopObserving,
  });
  const unsubscribePageContext = pageContext.subscribe(handlePageContextEvent);
  let isObserving = false;

  function handlePageContextEvent(event) {
    if (event.type === PAGE_CONTEXT_EVENT.STRUCTURE_MUTATION) {
      refreshStructureAndNotify();
      return;
    }
    if (event.type === PAGE_CONTEXT_EVENT.CONTEXT_RETARGET) {
      viewportGeometry.clearViewportElement();
      return;
    }
    syncContextAndNotify();
  }

  function handleSnapshotInvalidation() {
    syncContextAndNotify();
  }

  function refreshStructureAndNotify() {
    pageContext.syncObservedContext();
    viewportGeometry.refreshViewportElement();
    snapshotSource.notifyIfChanged();
  }

  function syncContextAndNotify() {
    pageContext.syncObservedContext();
    snapshotSource.notifyIfChanged();
  }

  function startObserving() {
    if (isObserving) {
      return;
    }
    isObserving = true;
    pageContext.start();
    pageContext.syncObservedContext();
    watcher.start();
  }

  function stopObserving() {
    if (!isObserving) {
      return;
    }
    isObserving = false;
    watcher.stop();
    pageContext.destroy();
    mapViewResolver.reset();
  }

  function destroy() {
    unsubscribePageContext();
    stopObserving();
    snapshotSource.destroy();
    viewportGeometry.destroy();
  }

  return {
    pageContext,
    snapshotSource,
    destroy,
  };
}
