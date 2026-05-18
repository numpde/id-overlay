import test from "node:test";
import assert from "node:assert/strict";

import {
  createContentOverlayTrace,
  createStartedContentHarness,
  dispatchKeyboard,
  dispatchPointer,
  durableImageState,
  firstPin,
  flushMicrotasks,
  placement,
  renderedOverlayImage,
  startContent,
  traceContentOverlayEdit,
} from "../../support/extension-content-overlay-harness.js";
import {
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b: keyboard handling must be wired at the real content entrypoint, not
// only in the keyboard adapter harness. Space temporarily returns interaction
// ownership to the native map without durable writes.
test("extension content Space toggles temporary native-map access without durability", async () => {
  const trace = createTrace("extension content Space toggles temporary native-map access without durability");
  const { window, chromeApi } = createStartedContentHarness({
    durableState: durableImageState({
      mode: "align",
      pins: [firstPin()],
    }),
  });

  const result = await startAndReturnRuntime({ trace, window, chromeApi });
  const keydown = dispatchKeyboard(window, window.document, "keydown", {
    key: " ",
    code: "Space",
  });
  await flushMicrotasks();

  assert.equal(keydown.defaultPrevented, true);
  assert.deepEqual(result.runtime.getState().inputOverride, {
    kind: "temporary-native-map-access",
  });
  assert.deepEqual(chromeApi.latestSet, undefined);
  traceKeyboardFact(trace, "space-down", "temporary-native-map-access-started", "command.set-temporary-input-posture");

  const keyup = dispatchKeyboard(window, window.document, "keyup", {
    key: " ",
    code: "Space",
  });
  await flushMicrotasks();

  assert.equal(keyup.defaultPrevented, true);
  assert.equal(result.runtime.getState().inputOverride, undefined);
  assert.deepEqual(chromeApi.latestSet, undefined);
  traceKeyboardFact(trace, "space-up", "temporary-native-map-access-ended", "command.set-temporary-input-posture");
});

// Class-b: temporary native-map access is a held-key posture. If the browser
// window loses focus before keyup, the content keyboard boundary must reset the
// posture through the same semantic interaction fact path.
test("extension content window blur resets temporary native-map access", async () => {
  const trace = createTrace("extension content window blur resets temporary native-map access");
  const { window, chromeApi } = createStartedContentHarness({
    durableState: durableImageState({
      mode: "align",
      pins: [firstPin()],
    }),
  });

  const result = await startAndReturnRuntime({ trace, window, chromeApi });
  dispatchKeyboard(window, window.document, "keydown", {
    key: " ",
    code: "Space",
  });
  await flushMicrotasks();
  assert.deepEqual(result.runtime.getState().inputOverride, {
    kind: "temporary-native-map-access",
  });
  traceKeyboardFact(trace, "space-down-before-blur", "temporary-native-map-access-started", "command.set-temporary-input-posture");

  window.dispatchEvent(new window.Event("blur"));
  await flushMicrotasks();

  assert.equal(result.runtime.getState().inputOverride, undefined);
  assert.deepEqual(chromeApi.latestSet, undefined);
  traceKeyboardFact(trace, "window-blur", "interaction-reset-requested", "command.set-temporary-input-posture");
});

// Class-b: Escape is the content keyboard route to Trace. It should cross the
// same rendered/shell command path as clicking Trace, persist mode, and re-render.
test("extension content Escape switches a loaded session to Trace", async () => {
  const trace = createTrace("extension content Escape switches a loaded session to Trace");
  const { window, chromeApi } = createStartedContentHarness({
    durableState: durableImageState({
      mode: "align",
    }),
  });

  const result = await startAndReturnRuntime({ trace, window, chromeApi });
  const event = dispatchKeyboard(window, window.document, "keydown", {
    key: "Escape",
    code: "Escape",
  });
  await flushMicrotasks();

  assert.equal(event.defaultPrevented, true);
  assert.equal(result.runtime.getState().session.mode, "trace");
  assert.equal(chromeApi.latestSet?.["id-overlay.durable-state"]?.session.mode, "trace");
  traceKeyboardFact(trace, "escape", "trace-mode-requested", "command.select-mode", true);
});

// Class-b: P toggles a pin at the current overlay pointer location. The
// content path must connect pointer observation, keyboard intent, projection,
// application mutation, and durability.
test("extension content P toggles a pin at the current rendered overlay pointer", async () => {
  const trace = createTrace("extension content P toggles a pin at the current rendered overlay pointer");
  const { window, chromeApi } = createStartedContentHarness({
    durableState: durableImageState({
      mode: "align",
      placement: placement(),
    }),
  });

  await startContent({ trace, window, chromeApi });
  dispatchPointer(window, renderedOverlayImage(window.document), "pointermove", {
    clientX: 600,
    clientY: 320,
  });
  dispatchKeyboard(window, window.document, "keydown", {
    key: "p",
    code: "KeyP",
  });
  await flushMicrotasks();

  assert.deepEqual(
    chromeApi.latestSet?.["id-overlay.durable-state"]?.session.registration?.pins,
    [firstPin()],
  );
  traceKeyboardFact(trace, "keyboard-pin", "registration-pin-toggle-requested", "command.toggle-registration-pin", true);
});

// Class-b: editable page targets keep normal browser keyboard behavior, while
// extension buttons remain shortcut-safe surfaces for global overlay shortcuts.
test("extension content ignores editable keyboard targets but accepts extension buttons", async () => {
  const trace = createTrace("extension content ignores editable keyboard targets but accepts extension buttons");
  const { window, chromeApi } = createStartedContentHarness({
    durableState: durableImageState({
      mode: "align",
      placement: placement(),
    }),
  });
  const input = window.document.createElement("input");
  window.document.body.append(input);

  await startContent({ trace, window, chromeApi });
  const editableEvent = dispatchKeyboard(window, input, "keydown", {
    key: "p",
    code: "KeyP",
  });
  await flushMicrotasks();

  assert.equal(editableEvent.defaultPrevented, false);
  assert.deepEqual(chromeApi.latestSet, undefined);
  trace.edge(flowEdge("source.keyboard.editable-target", "inert.editable-key-target", {
    phase: "editable-p",
    terminal: "intentionally-inert",
  }));

  const primary = renderedControl(window.document, "primary");
  const buttonEvent = dispatchKeyboard(window, primary, "keydown", {
    key: "Escape",
    code: "Escape",
  });
  await flushMicrotasks();

  assert.equal(buttonEvent.defaultPrevented, true);
  assert.equal(chromeApi.latestSet?.["id-overlay.durable-state"]?.session.mode, "trace");
  traceKeyboardFact(trace, "button-escape", "trace-mode-requested", "command.select-mode", true);
});

async function startAndReturnRuntime({ trace, window, chromeApi }) {
  let result = null;
  await trace.withSource("source.extension-content-start", async () => {
    result = await startContentForResult({ window, chromeApi });
    trace.edge(flowEdge("source.extension-content-start", "sink.render", {
      phase: "startup",
      terminal: "view-result",
    }));
  });
  return result;
}

async function startContentForResult({ window, chromeApi }) {
  const { startExtensionContent } = await import("../../../bootstrap/extension-content.js");
  const result = await startExtensionContent({
    document: window.document,
    ownerWindow: window,
    chromeApi,
    location: window.location,
  });
  assert.equal(result.kind, "started");
  return result;
}

function renderedControl(document, control) {
  const host = document.getElementById("id-overlay");
  assert.ok(host, "extension content must mount the owned UI root");
  const element = host.shadowRoot.querySelector(`[data-control='${control}']`);
  assert.ok(element, `extension content must render ${control} control`);
  return element;
}

function traceKeyboardFact(trace, phase, fact, command, persists = false) {
  trace.edge(flowEdge("source.keyboard", `callback.interaction-fact.${fact}`, {
    phase,
    provider: "keyboard-adapter",
  }));
  trace.edge(flowEdge(`callback.interaction-fact.${fact}`, command, {
    phase,
    provider: "browser-shell",
  }));
  trace.edge(flowEdge(command, "sink.render", {
    phase,
    terminal: "render-result",
  }));
  if (!persists) {
    return;
  }
  trace.edge(flowEdge(command, "effect.persist-durable-state", {
    phase,
    provider: "application-effect",
  }));
  trace.edge(flowEdge("effect.persist-durable-state", "port.durable-state.write", {
    phase,
    provider: "browser-shell",
  }));
  trace.edge(flowEdge("port.durable-state.write", "sink.durable-state.write", {
    phase,
    terminal: "storage-write",
  }));
}

function createTrace(testName) {
  return createContentOverlayTrace({
    file: import.meta.url,
    test: testName,
  });
}
