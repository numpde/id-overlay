import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Class-c: timer identity is already tested at the adapter/runtime boundary, but
// composed status timing is not a settled contract. This candidate assumes paste
// effects exist, notices schedule timer work, and timer completion re-enters as
// `clear-status-notice`. Promote only after transient status expiration is a
// named application effect instead of a shell convention.
test("empty paste notice schedules and clears matching status timer", async () => {
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

// Class-c: stale timer rejection is application law, but this composed version
// also chooses failed-paste copy and a browser clipboard sequence. Keep it
// quarantined until status copy, timer effects, and paste effects are each owned
// by one boundary.
test("stale status timer does not clear newer visible notice", async () => {
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
