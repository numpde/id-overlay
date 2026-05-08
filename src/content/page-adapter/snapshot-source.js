import { createPageSnapshotReader } from "./snapshot-reader.js";
import { createPageSnapshotStream } from "./snapshot-stream.js";
import { createPageSnapshotWatcher } from "./snapshot-watcher.js";

export function createPageSnapshotSource({
  hashTarget,
  pageContext,
  viewportGeometry,
  mapViewResolver,
  runBoundary,
  snapshotReader = createPageSnapshotReader({
    hashTarget,
    pageContext,
    viewportGeometry,
    mapViewResolver,
    runBoundary,
  }),
  snapshotStream = null,
}) {
  const watcher = createPageSnapshotWatcher({
    hashTarget,
    pageContext,
    onChange: notifyIfChanged,
  });
  const stream = snapshotStream ?? createPageSnapshotStream({
    readSnapshot,
    onFirstSubscriber: startWatching,
    onNoSubscribers: stopWatching,
    notifyListener(listener, snapshot) {
      runBoundary("notify-listener", () => {
        listener(snapshot);
      });
    },
  });

  function getSnapshot() {
    return stream.getSnapshot();
  }

  function subscribe(listener) {
    const result = runBoundary("subscribe-listener", () => {
      return stream.subscribe(listener);
    });
    return result.ok ? result.value : () => {};
  }

  function notifyIfChanged() {
    // TODO(smell): Retargeting page context before every snapshot notification
    // is correct but implicit. The final watcher should emit retarget facts that
    // snapshot construction consumes explicitly.
    pageContext.syncObservedContext();
    stream.notifyIfChanged();
  }

  function handleStructureMutation() {
    viewportGeometry.refreshViewportElement();
    notifyIfChanged();
  }

  function startWatching() {
    watcher.start();
  }

  function stopWatching() {
    watcher.stop();
    mapViewResolver.reset();
  }

  function destroy() {
    stream.destroy();
    stopWatching();
    viewportGeometry.destroy();
  }

  function readSnapshot({ lastSnapshot }) {
    return snapshotReader.readSnapshot({
      lastSnapshot,
    });
  }

  return {
    getSnapshot,
    subscribe,
    destroy,
    notifyIfChanged,
    handleStructureMutation,
  };
}
