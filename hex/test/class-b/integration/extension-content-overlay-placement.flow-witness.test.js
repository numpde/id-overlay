import test from "node:test";
import assert from "node:assert/strict";

import {
  createContentOverlayTrace,
  createStartedContentHarness,
  dispatchPointer,
  dispatchWheel,
  durableImageState,
  flushMicrotasks,
  legacyRotatedPlacement,
  legacyScaledPlacement,
  placement,
  renderedOverlayImage,
  startContent,
  traceContentOverlayEdit,
} from "../../support/extension-content-overlay-harness.js";
import {
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b: this is the real content-entrypoint witness for overlay movement.
// Component tests may inject projection ports; the browser content host must
// make the rendered Shift-drag path complete for users.
test("extension content commits rendered Align shift-drag overlay movement", async () => {
  const trace = createTrace("extension content commits rendered Align shift-drag overlay movement");
  const { window, chromeApi } = createStartedContentHarness({
    durableState: durableImageState({
      mode: "align",
      placement: placement(),
    }),
  });

  await startContent({ trace, window, chromeApi });
  const image = renderedOverlayImage(window.document);
  dispatchPointer(window, image, "pointerdown", {
    clientX: 500,
    clientY: 300,
    shiftKey: true,
  });
  dispatchPointer(window, window, "pointermove", {
    clientX: 560,
    clientY: 280,
    shiftKey: true,
  });
  dispatchPointer(window, window, "pointerup", {
    clientX: 560,
    clientY: 280,
    shiftKey: true,
  });
  await flushMicrotasks();

  assert.deepEqual(chromeApi.latestSet?.["id-overlay.durable-state"]?.session.placement, placement({
    x: 80,
    y: -10,
  }));
  traceContentOverlayEdit(trace, "shift-drag-move", "command.commit-placement-edit");
});

// Class-b: a rendered drag is one user gesture, not one commit per browser
// pointermove. Re-rendering after the first move must not tear down the active
// sequence and leave the rest of the drag inert.
test("extension content commits the full rendered Align shift-drag sequence", async () => {
  const trace = createTrace("extension content commits the full rendered Align shift-drag sequence");
  const { window, chromeApi } = createStartedContentHarness({
    durableState: durableImageState({
      mode: "align",
      placement: placement(),
    }),
  });

  await startContent({ trace, window, chromeApi });
  const image = renderedOverlayImage(window.document);
  dispatchPointer(window, image, "pointerdown", {
    clientX: 500,
    clientY: 300,
    shiftKey: true,
  });
  dispatchPointer(window, window, "pointermove", {
    clientX: 530,
    clientY: 318,
    shiftKey: true,
  });
  await flushMicrotasks();
  assert.deepEqual(chromeApi.latestSet, undefined);

  dispatchPointer(window, window, "pointermove", {
    clientX: 620,
    clientY: 372,
    shiftKey: true,
  });
  dispatchPointer(window, window, "pointerup", {
    clientX: 620,
    clientY: 372,
    shiftKey: true,
  });
  await flushMicrotasks();

  assert.deepEqual(chromeApi.latestSet?.["id-overlay.durable-state"]?.session.placement, placement({
    x: 140,
    y: 82,
  }));
  traceContentOverlayEdit(trace, "shift-drag-full-sequence", "command.commit-placement-edit");
});

// Class-b: modifier wheel interactions are rendered overlay interactions, not
// merely runtime mapper facts. Align ctrl/shift wheel must commit placement
// edits through the same content entrypoint the user exercises.
test("extension content commits rendered Align ctrl and shift wheel placement edits", async () => {
  const trace = createTrace("extension content commits rendered Align ctrl and shift wheel placement edits");
  for (const [phase, modifiers, expectedPlacement] of [
    ["ctrl-wheel-rotate", { ctrlKey: true }, legacyRotatedPlacement()],
    ["shift-wheel-scale", { shiftKey: true }, legacyScaledPlacement()],
  ]) {
    const { window, chromeApi } = createStartedContentHarness({
      durableState: durableImageState({
        mode: "align",
        placement: placement(),
      }),
    });

    await startContent({ trace, window, chromeApi, phase });
    dispatchWheel(window, renderedOverlayImage(window.document), modifiers);
    await flushMicrotasks();

    assert.deepEqual(
      chromeApi.latestSet?.["id-overlay.durable-state"]?.session.placement,
      expectedPlacement,
    );
    traceContentOverlayEdit(trace, phase, "command.commit-placement-edit");
  }
});

// Class-b: Trace keeps the overlay visible but disables placement editing.
// Shift-drag, ctrl-wheel, and shift-wheel must not write product state from the
// rendered content entrypoint.
test("extension content leaves rendered Trace placement gestures inert", async () => {
  const trace = createTrace("extension content leaves rendered Trace placement gestures inert");
  const initialState = durableImageState({
    mode: "trace",
    opacity: 0.6,
    placement: placement(),
  });
  const { window, chromeApi } = createStartedContentHarness({
    durableState: initialState,
  });

  await startContent({ trace, window, chromeApi, phase: "trace-startup" });
  const image = renderedOverlayImage(window.document);
  dispatchPointer(window, image, "pointerdown", {
    clientX: 500,
    clientY: 300,
    shiftKey: true,
  });
  dispatchPointer(window, window, "pointermove", {
    clientX: 560,
    clientY: 280,
    shiftKey: true,
  });
  dispatchPointer(window, window, "pointerup", {
    clientX: 560,
    clientY: 280,
    shiftKey: true,
  });
  dispatchWheel(window, image, {
    ctrlKey: true,
  });
  dispatchWheel(window, image, {
    shiftKey: true,
  });
  await flushMicrotasks();

  assert.deepEqual(chromeApi.latestSet, undefined);
  assert.deepEqual(chromeApi.records["id-overlay.durable-state"], initialState);
  for (const phase of ["trace-shift-drag", "trace-ctrl-wheel", "trace-shift-wheel"]) {
    trace.edge(flowEdge("source.rendered-overlay.trace-placement-input", "inert.trace-overlay-placement-disabled", {
      phase,
      terminal: "intentionally-inert",
    }));
  }
});

function createTrace(testName) {
  return createContentOverlayTrace({
    file: import.meta.url,
    test: testName,
  });
}
