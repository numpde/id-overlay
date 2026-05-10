import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Unclassified: the timer adapter already preserves request identity. This
// candidate captures composed status behavior: visible notices should schedule
// matching clear work through a timer port, then clear only when the matching
// timer fires.
test("candidate: empty paste notice schedules and clears matching status timer", async () => {
  const storage = createDurableStorageHarness({
    durableState: null,
  });
  const clipboard = createClipboardImageHarness({
    readReferenceImageResult: {
      kind: "empty",
    },
  });
  const timers = createTimerHarness();
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    clipboardImagePort: clipboard.port,
    timerPort: timers.port,
  });

  await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });

  assert.equal(host.latestRender.view.status, "Clipboard does not contain an image.");
  assert.deepEqual(timers.scheduled.map(({ requestId, purpose }) => ({
    requestId,
    purpose,
  })), [{
    requestId: 1,
    purpose: "clear-status-notice",
  }]);

  await timers.fireLatest();

  assert.equal(host.latestRender.view.status, "");
});

// Unclassified: stale timer handling is a class-a reducer law. This composed
// candidate ensures the shell does not collapse timer identity before the app
// can reject an old clear-status result.
test("candidate: stale status timer does not clear newer visible notice", async () => {
  const storage = createDurableStorageHarness({
    durableState: null,
  });
  const clipboard = createClipboardImageHarness({
    readReferenceImageResults: [
      {
        kind: "empty",
      },
      {
        kind: "failed",
        reason: "decode-failed",
      },
    ],
  });
  const timers = createTimerHarness();
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    clipboardImagePort: clipboard.port,
    timerPort: timers.port,
  });

  await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });

  await timers.fireOldest();

  assert.equal(host.latestRender.view.status, "Clipboard image could not be read.");
});

function createBrowserHostHarness({
  durableStatePort,
  clipboardImagePort,
  timerPort,
}) {
  return {
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort,
    clipboardImagePort,
    timerPort,
    latestRender: null,
    mountOwnedRoot(ownerId, root) {
      return {
        ...root,
        ownerId,
      };
    },
    renderApplicationView(render) {
      this.latestRender = render;
    },
    startRuntime(runtime) {
      return runtime;
    },
  };
}

function createDurableStorageHarness({ durableState }) {
  return {
    port: {
      async readDurableState() {
        return durableState;
      },
      async writeDurableState() {},
    },
  };
}

function createClipboardImageHarness({
  readReferenceImageResult = null,
  readReferenceImageResults = [readReferenceImageResult],
}) {
  const pending = [...readReferenceImageResults];
  return {
    port: {
      async readReferenceImage() {
        return pending.shift() ?? {
          kind: "empty",
        };
      },
    },
  };
}

function createTimerHarness() {
  const scheduled = [];
  return {
    scheduled,
    async fireLatest() {
      const timer = scheduled.at(-1);
      if (!timer) {
        throw new TypeError("browser shell did not schedule a status timer");
      }
      await timer.complete();
    },
    async fireOldest() {
      const timer = scheduled[0];
      if (!timer) {
        throw new TypeError("browser shell did not schedule a status timer");
      }
      await timer.complete();
    },
    port: {
      startTimer({ requestId, purpose, complete }) {
        scheduled.push({
          requestId,
          purpose,
          complete,
        });
      },
      cancelTimer() {},
    },
  };
}
