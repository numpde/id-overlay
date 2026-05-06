import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPinRenderModels,
  hitTestPin,
} from "../../src/core/pin-render.js";

test("buildPinRenderModels and hitTestPin share the same screen geometry", () => {
  const pins = buildPinRenderModels({
    pins: [
      {
        id: 1,
        imagePx: { x: 20, y: 30 },
        mapLatLon: { lat: 0, lon: 0 },
      },
    ],
    projectOverlayScreenPoint: () => ({ x: 120, y: 80 }),
    projectMapScreenPoint: () => ({ x: 140, y: 100 }),
  });

  assert.deepEqual(pins[0].overlayScreenPx, { x: 120, y: 80 });
  assert.deepEqual(pins[0].mapScreenPx, { x: 140, y: 100 });
  assert.equal(
    hitTestPin({
      screenPoint: { x: 123, y: 82 },
      renderedPins: pins,
    })?.id,
    1,
  );
  assert.equal(
    hitTestPin({
      screenPoint: { x: 143, y: 102 },
      renderedPins: pins,
      resolveTargetScreenPoint: (pin) => pin.mapScreenPx,
    })?.id,
    1,
  );
});
