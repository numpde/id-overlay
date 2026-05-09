export function createDisposerSequence(disposers = []) {
  let destroyed = false;

  return {
    destroy,
  };

  function destroy() {
    if (destroyed) {
      return;
    }
    destroyed = true;
    for (const dispose of disposers) {
      dispose();
    }
  }
}
