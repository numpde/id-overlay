export function observeHistoryMutations({ hashTarget, onHistoryMutation }) {
  const history = hashTarget.history;
  if (!history) {
    return null;
  }

  const originalReplaceState = typeof history.replaceState === "function"
    ? history.replaceState
    : null;
  const originalPushState = typeof history.pushState === "function"
    ? history.pushState
    : null;

  if (!originalReplaceState && !originalPushState) {
    return null;
  }

  if (originalReplaceState) {
    history.replaceState = function patchedReplaceState(...args) {
      const result = originalReplaceState.apply(history, args);
      onHistoryMutation();
      return result;
    };
  }

  if (originalPushState) {
    history.pushState = function patchedPushState(...args) {
      const result = originalPushState.apply(history, args);
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
