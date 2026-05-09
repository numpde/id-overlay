import test from "node:test";
import assert from "node:assert/strict";

import { createOverlayEnvironment } from "../../src/content/overlay-environment.js";

test("overlay environment names the page, machine, and interaction ports consumed by overlay composition", () => {
  const pagePorts = {
    pageObservation: { label: "pageObservation" },
    pageProjection: { label: "pageProjection" },
    mapGesture: {
      isForwardedMapGestureEvent: () => true,
    },
  };
  const machineHost = { label: "machineHost" };
  const overlayInteractions = { label: "overlayInteractions" };

  const environment = createOverlayEnvironment({
    pagePorts,
    machineHost,
    overlayInteractions,
  });

  assert.deepEqual(Object.keys(environment), [
    "pageObservation",
    "pageProjection",
    "isForwardedMapGestureEvent",
    "machineHost",
    "overlayInteractions",
  ]);
  assert.equal(environment.pageObservation, pagePorts.pageObservation);
  assert.equal(environment.pageProjection, pagePorts.pageProjection);
  assert.equal(environment.isForwardedMapGestureEvent, pagePorts.mapGesture.isForwardedMapGestureEvent);
  assert.equal(environment.machineHost, machineHost);
  assert.equal(environment.overlayInteractions, overlayInteractions);
  assert.equal(Object.isFrozen(environment), true);
});
