import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Class-c: this is the preferred timer boundary, but it deliberately conflicts
// with today's class-a effect vocabulary (`schedule-clear-status-notice` and
// `schedule-clear-panel-intent`). The clean cut-over is one generic
// `schedule-application-command` effect whose payload already contains the
// command the app wants to receive later.
//
// Decision: keep quarantined with the timer-port candidates. Promote only when
// bootstrap schedules clocks without inspecting `notice`, `panelIntent`, or any
// other product field to decide what to clear.
test("browser shell clears status by dispatching the scheduled app command", async () => {
  const timers = createApplicationCommandTimerHarness();
  const host = createBrowserHostHarness({
    timerPort: timers.port,
  });

  await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });
  await host.latestRender.dispatchCommand({
    kind: "report-reference-image-input-outcome",
    requestId: 1,
    outcome: {
      kind: "empty",
    },
  });

  assert.deepEqual(timers.schedules, [{
    scheduleId: "status-notice",
    delayMs: 2500,
    command: {
      kind: "clear-status-notice",
      requestId: 1,
    },
  }]);

  await timers.fire("status-notice");

  assert.equal(host.latestRender.view.status, "");
});

// Class-c: confirmation expiry should use the same protocol as status expiry.
// The shell schedules and fires the embedded command; the application owns
// intent matching and stale rejection. Today that protocol is not implemented.
test("browser shell clears panel intent by dispatching the scheduled app command", async () => {
  const timers = createApplicationCommandTimerHarness();
  const host = createBrowserHostHarness({
    durableStatePort: createDurableStorageHarness({
      durableState: durableImageState(),
    }).port,
    timerPort: timers.port,
  });

  await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });

  assert.deepEqual(timers.schedules, [{
    scheduleId: "panel-intent",
    delayMs: 2500,
    command: {
      kind: "clear-panel-intent",
      requestId: 1,
      intentKind: "confirm-clear-reference-image",
    },
  }]);
  assert.match(host.latestRender.view.primaryAction.label, /clear image\?/i);

  await timers.fire("panel-intent");

  assert.equal(host.latestRender.view.primaryAction.label, "Clear image");
});

function createBrowserHostHarness({
  durableStatePort = createDurableStorageHarness({
    durableState: null,
  }).port,
  timerPort,
}) {
  return {
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort,
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

function createApplicationCommandTimerHarness() {
  const scheduleEntries = [];
  return {
    get schedules() {
      return scheduleEntries.map(({ scheduleId, delayMs, command }) => ({
        scheduleId,
        delayMs,
        command,
      }));
    },
    async fire(scheduleId) {
      const scheduled = scheduleEntries.find((schedule) => schedule.scheduleId === scheduleId);
      if (!scheduled) {
        throw new TypeError(`missing schedule: ${scheduleId}`);
      }
      await scheduled.dispatchApplicationCommand(scheduled.command);
    },
    port: {
      scheduleApplicationCommand({
        scheduleId,
        delayMs,
        command,
        dispatchApplicationCommand,
      }) {
        scheduleEntries.push({
          scheduleId,
          delayMs,
          command,
          dispatchApplicationCommand,
        });
      },
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

function durableImageState() {
  return {
    session: {
      mode: "align",
      referenceImage: {
        imageDataRef: "reference-image-data-1",
        intrinsicSizePx: {
          width: 640,
          height: 480,
        },
      },
    },
  };
}
