const PAGE_MUTATION_OBSERVER_OPTIONS = Object.freeze({
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: Object.freeze(["class", "style", "src"]),
});

export function createPageMutationObservation({
  MutationObserverCtor = globalThis.MutationObserver,
  onMutation,
  onObservedRootChanged = () => {},
}) {
  let observer = null;
  let observedRoot = null;

  function start() {
    if (observer) {
      return;
    }
    observer = new MutationObserverCtor(onMutation);
    if (observedRoot) {
      observer.observe(observedRoot, PAGE_MUTATION_OBSERVER_OPTIONS);
    }
  }

  function observeRoot(root) {
    if (observedRoot === root) {
      return;
    }
    observedRoot = root;
    if (observer) {
      observer.disconnect();
      observer.observe(observedRoot, PAGE_MUTATION_OBSERVER_OPTIONS);
    }
    onObservedRootChanged(root);
  }

  function destroy() {
    observer?.disconnect();
    observer = null;
    observedRoot = null;
  }

  return {
    start,
    observeRoot,
    destroy,
  };
}
