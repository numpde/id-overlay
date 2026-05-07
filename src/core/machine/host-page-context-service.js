import {
  needsPageContextReconciliation,
  reconcilePageContext,
} from "./page-context.js";

export function createMachineHostPageContextService({
  runtime,
  persistedSession = null,
  commitMachineResult,
} = {}) {
  let pendingPersistedSession = persistedSession;

  function ingestPageContext(pageContext) {
    const currentState = runtime.getState();
    const result = commitMachineResult(reconcilePageContext(currentState, {
      persistedSession: pendingPersistedSession,
      pageContext,
    }), {
      pageContext,
    });
    if (
      result.state !== currentState ||
      !needsPageContextReconciliation(currentState, pendingPersistedSession)
    ) {
      pendingPersistedSession = null;
    }
    return result;
  }

  return {
    ingestPageContext,
  };
}
