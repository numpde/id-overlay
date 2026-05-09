import { createPageSnapshotReader } from "./snapshot-reader.js";
import { createPageSnapshotStream } from "./snapshot-stream.js";

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
  onFirstSubscriber = () => {},
  onNoSubscribers = () => {},
}) {
  const stream = snapshotStream ?? createPageSnapshotStream({
    readSnapshot,
    onFirstSubscriber,
    onNoSubscribers,
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
    stream.notifyIfChanged();
  }

  function destroy() {
    stream.destroy();
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
  };
}
