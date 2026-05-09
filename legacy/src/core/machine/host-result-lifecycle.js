export function createMachineHostResultLifecycle({
  runtime,
  persistenceService = null,
  effectServices = null,
} = {}) {
  function commitMachineResult(result, context = {}) {
    const committedResult = runtime.commitMachineResult(result);
    const observerContext = {
      ...context,
      state: committedResult.state,
      result: committedResult,
    };
    persistenceService?.persistCommittedResult?.(committedResult, observerContext);
    effectServices?.runCommittedEffects?.(committedResult, observerContext);
    return committedResult;
  }

  function destroy() {
    persistenceService?.destroy?.();
    effectServices?.destroy?.();
  }

  return {
    commitMachineResult,
    destroy,
  };
}
