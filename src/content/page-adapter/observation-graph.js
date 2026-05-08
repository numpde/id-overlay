import {
  PAGE_CONTEXT_EVENT,
  createPageContext,
} from "./page-context.js";
import { createPageSnapshotSource } from "./snapshot-source.js";

export function createPageObservationGraph({
  hashTarget,
  viewportDocument,
  viewportGeometry,
  mapViewResolver,
  runBoundary,
  createContext = createPageContext,
  createSnapshotSource = createPageSnapshotSource,
}) {
  const pageContext = createContext({
    hashTarget,
    viewportDocument,
  });
  const snapshotSource = createSnapshotSource({
    hashTarget,
    pageContext,
    viewportGeometry,
    mapViewResolver,
    runBoundary,
  });
  const unsubscribePageContext = pageContext.subscribe(handlePageContextEvent);

  function handlePageContextEvent(event) {
    if (event.type === PAGE_CONTEXT_EVENT.STRUCTURE_MUTATION) {
      snapshotSource.handleStructureMutation();
      return;
    }
    if (event.type === PAGE_CONTEXT_EVENT.CONTEXT_RETARGET) {
      viewportGeometry.clearViewportElement();
      return;
    }
    snapshotSource.notifyIfChanged();
  }

  function destroy() {
    unsubscribePageContext();
    snapshotSource.destroy();
  }

  return {
    pageContext,
    snapshotSource,
    destroy,
  };
}
