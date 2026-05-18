import test from "node:test";
import assert from "node:assert/strict";

import {
  createContentOverlayTrace,
  createStartedContentHarness,
  durableImageState,
  flushMicrotasks,
  startContent,
} from "../../support/extension-content-overlay-harness.js";
import {
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b: the real content entrypoint must provide the browser timer boundary.
// The application already emits an exact delayed command for destructive
// confirmation expiry; without a content-host timer port, the rendered
// "Clear image?" state never disarms in the extension even though shell tests
// pass with an injected harness timer.
test("extension content expires rendered clear-image confirmation through a browser timer", async () => {
  const trace = createContentOverlayTrace({
    file: import.meta.url,
    test: "extension content expires rendered clear-image confirmation through a browser timer",
  });
  const caseId = "content-clear-image-expiry";
  const { window, chromeApi } = createStartedContentHarness({
    durableState: durableImageState({
      mode: "align",
    }),
  });
  const scheduledPanelIntentTimers = installPanelIntentTimerProbe(window);

  await startContent({
    trace,
    window,
    chromeApi,
    phase: "startup",
  });

  const primary = renderedControl(window.document, "primary");
  assert.equal(primary.textContent, "Clear image");

  trace.withSource("source.rendered-command.activate-primary-action", () => {
    primary.click();
    trace.edge(flowEdge("source.rendered-command.activate-primary-action", "command.activate-primary-action", {
      case: caseId,
      phase: "arm-clear-image",
      provider: "extension-ui-host",
    }));
    trace.edge(flowEdge("command.activate-primary-action", "effect.schedule-application-command", {
      case: caseId,
      phase: "panel-intent",
      provider: "application",
    }));
    trace.edge(flowEdge("effect.schedule-application-command", "port.timer.schedule-application-command", {
      case: caseId,
      phase: "panel-intent",
      provider: "browser-shell-effect-handler",
    }));
    trace.edge(flowEdge("port.timer.schedule-application-command", "callback.timer.panel-intent", {
      case: caseId,
      phase: "panel-intent-scheduled",
      provider: "web-timer-port",
    }));
    trace.edge(flowEdge("command.activate-primary-action", "sink.render", {
      case: caseId,
      phase: "panel-intent-armed",
      terminal: "view-result",
    }));
  });
  await flushMicrotasks();

  assert.equal(renderedControl(window.document, "primary").textContent, "Clear image?");
  assert.equal(scheduledPanelIntentTimers.length, 1);
  assert.equal(scheduledPanelIntentTimers[0].delayMs, 2500);

  await trace.withSource("source.timer.panel-intent.fire", async () => {
    trace.edge(flowEdge("source.timer.panel-intent.fire", "callback.timer.panel-intent", {
      case: caseId,
      phase: "panel-intent",
      provider: "web-timer-port",
    }));
    await scheduledPanelIntentTimers[0].callback();
    trace.edge(flowEdge("callback.timer.panel-intent", "command.clear-panel-intent", {
      case: caseId,
      phase: "panel-intent",
      provider: "web-timer-port",
    }));
    trace.edge(flowEdge("command.clear-panel-intent", "sink.render", {
      case: caseId,
      phase: "panel-intent-expired",
      terminal: "view-result",
    }));
  });
  await flushMicrotasks();

  assert.equal(renderedControl(window.document, "primary").textContent, "Clear image");
});

function renderedControl(document, control) {
  const host = document.getElementById("id-overlay");
  assert.ok(host, "extension content must mount the owned UI root");
  const element = host.shadowRoot.querySelector(`[data-control='${control}']`);
  assert.ok(element, `extension content must render ${control} control`);
  return element;
}

function installPanelIntentTimerProbe(window) {
  const nativeSetTimeout = window.setTimeout.bind(window);
  const nativeClearTimeout = window.clearTimeout.bind(window);
  const scheduledPanelIntentTimers = [];
  let nextPanelIntentHandle = 1;

  window.setTimeout = (callback, delayMs, ...args) => {
    if (delayMs === 2500) {
      const handle = {
        id: nextPanelIntentHandle,
      };
      nextPanelIntentHandle += 1;
      scheduledPanelIntentTimers.push({
        callback,
        delayMs,
        handle,
      });
      return handle;
    }
    return nativeSetTimeout(callback, delayMs, ...args);
  };
  window.clearTimeout = (handle) => {
    if (scheduledPanelIntentTimers.some((timer) => timer.handle === handle)) {
      return;
    }
    nativeClearTimeout(handle);
  };

  return scheduledPanelIntentTimers;
}
