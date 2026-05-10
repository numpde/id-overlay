import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";
import {
  createBrowserHostHarness,
  createDurableStorageHarness,
  durableImageState,
} from "./candidate-browser-harness.js";

// Unclassified: confirmation timing is UI policy, not class-a application law.
// The user-facing invariant is firm enough to test as a candidate: destructive
// confirmation is request-scoped, expires, and is cancelled when the posture
// changes before the second click.
test("candidate: clear-image confirmation is request-scoped and expires through a timer port", async () => {
  const timer = createTimerHarness();
  const host = createBrowserHostHarness({
    durableStatePort: createDurableStorageHarness({
      durableState: durableImageState(),
    }).port,
    timerPort: timer.port,
  });

  await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });
  assert.equal(host.latestRender.view.primaryAction.label, "Clear image?");
  assert.deepEqual(timer.started, [{
    kind: "panel-intent-timeout",
    requestId: 1,
  }]);

  await timer.fireCurrent();

  assert.equal(host.latestRender.view.primaryAction.label, "Clear image");
  assert.equal(host.latestRender.view.overlay.visible, true);
});

// Unclassified: this should remain true even if the timeout duration or copy
// changes. A confirmation that was visible in Align must not stay armed after a
// mode switch changes the meaning of the main button.
test("candidate: switching mode cancels pending clear-image confirmation", async () => {
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
    }),
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
  });

  await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });
  await host.latestRender.dispatchCommand({
    kind: "select-mode",
    mode: "trace",
  });

  assert.equal(host.latestRender.view.primaryAction.label, "Clear image");
  assert.equal(host.latestRender.view.overlay.visible, true);
});

function createTimerHarness() {
  const started = [];
  let currentCallback = null;
  return {
    started,
    async fireCurrent() {
      assert.equal(typeof currentCallback, "function");
      await currentCallback();
    },
    port: {
      startTimer({ kind, requestId, callback }) {
        started.push({
          kind,
          requestId,
        });
        currentCallback = callback;
      },
      cancelTimer() {},
    },
  };
}
