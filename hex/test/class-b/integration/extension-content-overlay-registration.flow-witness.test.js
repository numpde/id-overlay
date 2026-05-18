import test from "node:test";
import assert from "node:assert/strict";

import {
  createContentOverlayTrace,
  createStartedContentHarness,
  dispatchMouse,
  durableImageState,
  firstPin,
  flushMicrotasks,
  imagePxForScreenPx,
  mapLatLonForHarnessScreenPx,
  placement,
  renderedOverlayImage,
  startContent,
  traceContentOverlayEdit,
} from "../../support/extension-content-overlay-harness.js";
import {
  flowEdge,
} from "../../support/flow-trace.js";
import {
  REGISTRATION_PIN_MARKER_HIT_RADIUS_SCREEN_PX,
} from "../../../adapters/ui/registration-pin-marker.js";

// Class-b: rendered overlay pin toggling must not stop at a DOM double-click.
// The content host must project the point and persist the resulting Align pin.
test("extension content commits rendered Align double-click pin toggle", async () => {
  const trace = createTrace("extension content commits rendered Align double-click pin toggle");
  const { window, chromeApi } = createStartedContentHarness({
    durableState: durableImageState({
      mode: "align",
      placement: placement(),
    }),
  });

  await startContent({ trace, window, chromeApi });
  const image = renderedOverlayImage(window.document);
  dispatchMouse(window, image, "dblclick", {
    clientX: 600,
    clientY: 320,
  });
  await flushMicrotasks();

  assert.deepEqual(
    chromeApi.latestSet?.["id-overlay.durable-state"]?.session.registration?.pins,
    [firstPin()],
  );
  traceContentOverlayEdit(trace, "double-click-pin", "command.toggle-registration-pin");
});

// Class-b: double-clicking an existing rendered registration point removes that
// pin through the same content path that adds one.
test("extension content commits rendered Align double-click existing pin removal", async () => {
  const trace = createTrace("extension content commits rendered Align double-click existing pin removal");
  const { window, chromeApi } = createStartedContentHarness({
    durableState: durableImageState({
      mode: "align",
      placement: placement(),
      pins: [firstPin()],
    }),
  });

  await startContent({ trace, window, chromeApi });
  dispatchMouse(window, renderedOverlayImage(window.document), "dblclick", {
    clientX: 600,
    clientY: 320,
  });
  await flushMicrotasks();

  assert.notEqual(chromeApi.latestSet, undefined);
  assert.equal(
    chromeApi.latestSet?.["id-overlay.durable-state"]?.session.registration,
    undefined,
  );
  traceContentOverlayEdit(trace, "double-click-existing-pin", "command.toggle-registration-pin");
});

// Class-b: deletion should follow the visible marker hit target, not an 8px
// geometry kernel. Double-clicking the rendered pin edge should still remove
// that pin instead of adding a second pin beside it.
test("extension content removes existing pin from the visible marker hit target", async () => {
  const trace = createTrace("extension content removes existing pin from the visible marker hit target");
  const { window, chromeApi } = createStartedContentHarness({
    durableState: durableImageState({
      mode: "align",
      placement: placement(),
      pins: [firstPin()],
    }),
  });

  await startContent({ trace, window, chromeApi });
  dispatchMouse(window, renderedOverlayImage(window.document), "dblclick", {
    clientX: 600 + REGISTRATION_PIN_MARKER_HIT_RADIUS_SCREEN_PX,
    clientY: 320,
  });
  await flushMicrotasks();

  assert.notEqual(chromeApi.latestSet, undefined);
  assert.equal(
    chromeApi.latestSet?.["id-overlay.durable-state"]?.session.registration,
    undefined,
  );
  traceContentOverlayEdit(trace, "double-click-existing-pin-visible-hit-target", "command.toggle-registration-pin");
});

// Class-b: pin edits after a solved fit preserve the current visible placement
// but clear stale solved metadata. This protects the rendered registration path,
// not just the application reducer law.
test("extension content pin edits preserve placement and invalidate solved metadata", async () => {
  const trace = createTrace("extension content pin edits preserve placement and invalidate solved metadata");
  const visiblePlacement = placement({
    x: 80,
    y: 40,
    scale: 1.25,
    rotationRad: 0.1,
  });
  const addedPin = thirdPin({
    imagePx: imagePxForScreenPx({
      screenPx: {
        x: 650,
        y: 340,
      },
      placement: visiblePlacement,
    }),
  });
  const { window, chromeApi } = createStartedContentHarness({
    durableState: {
      session: {
        ...durableImageState({
          mode: "align",
          placement: visiblePlacement,
          pins: [firstPin(), secondPin()],
        }).session,
        registration: {
          pins: [firstPin(), secondPin()],
          solvedPlacement: visiblePlacement,
        },
      },
    },
  });

  await startContent({ trace, window, chromeApi });
  dispatchMouse(window, renderedOverlayImage(window.document), "dblclick", {
    clientX: 650,
    clientY: 340,
  });
  await flushMicrotasks();

  const session = chromeApi.latestSet?.["id-overlay.durable-state"]?.session;
  assert.deepEqual(session?.placement, visiblePlacement);
  assert.equal(session?.registration?.solvedPlacement, undefined);
  assert.deepEqual(session?.registration?.pins, [firstPin(), secondPin(), addedPin]);
  traceContentOverlayEdit(trace, "double-click-add-after-solve", "command.toggle-registration-pin");
});

// Class-b: a plain overlay click is DOM ownership only. It must not toggle pins
// or commit any other product state while the overlay owns the browser click
// sequence in Align.
test("extension content consumes rendered Align click without pin toggle", async () => {
  const trace = createTrace("extension content consumes rendered Align click without pin toggle");
  const { window, chromeApi } = createStartedContentHarness({
    durableState: durableImageState({
      mode: "align",
      placement: placement(),
    }),
  });

  await startContent({ trace, window, chromeApi });
  const click = dispatchMouse(window, renderedOverlayImage(window.document), "click", {
    clientX: 600,
    clientY: 320,
  });
  await flushMicrotasks();

  assert.equal(click.defaultPrevented, true);
  assert.deepEqual(chromeApi.latestSet, undefined);
  trace.edge(flowEdge("source.rendered-overlay.click", "sink.dom-event-ownership", {
    phase: "plain-click",
    terminal: "browser-event-consumed",
  }));
  trace.edge(flowEdge("source.rendered-overlay.click", "inert.no-registration-pin-toggle", {
    phase: "plain-click",
    terminal: "intentionally-inert",
  }));
});

// Class-b: registration editing is Align-only. Trace may keep the image visible,
// but a rendered double-click must not write registration state.
test("extension content leaves rendered Trace pin gestures inert", async () => {
  const trace = createTrace("extension content leaves rendered Trace pin gestures inert");
  const initialState = durableImageState({
    mode: "trace",
    opacity: 0.6,
    placement: placement(),
  });
  const { window, chromeApi } = createStartedContentHarness({
    durableState: initialState,
  });

  await startContent({ trace, window, chromeApi, phase: "trace-startup" });
  dispatchMouse(window, renderedOverlayImage(window.document), "dblclick", {
    clientX: 600,
    clientY: 320,
  });
  await flushMicrotasks();

  assert.deepEqual(chromeApi.latestSet, undefined);
  assert.deepEqual(chromeApi.records["id-overlay.durable-state"], initialState);
  trace.edge(flowEdge("source.rendered-overlay.trace-registration-input", "inert.trace-registration-disabled", {
    phase: "trace-double-click-pin",
    terminal: "intentionally-inert",
  }));
});

function createTrace(testName) {
  return createContentOverlayTrace({
    file: import.meta.url,
    test: testName,
  });
}

function secondPin() {
  return {
    id: 2,
    imagePx: {
      x: 520,
      y: 240,
    },
    mapLatLon: {
      lat: -1.23,
      lon: 38.84,
    },
  };
}

function thirdPin({ imagePx }) {
  return {
    id: 3,
    imagePx,
    mapLatLon: mapLatLonForHarnessScreenPx({
      x: 650,
      y: 340,
    }),
  };
}
