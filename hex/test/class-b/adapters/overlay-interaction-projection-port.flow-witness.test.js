import test from "node:test";
import assert from "node:assert/strict";

import {
  createOverlayInteractionProjectionPort,
} from "../../../adapters/ui/overlay-interaction-projection-port.js";
import {
  REGISTRATION_PIN_MARKER_HIT_RADIUS_SCREEN_PX,
} from "../../../adapters/ui/registration-pin-marker.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b: registration pins are image facts plus map facts. The map fact must
// be projected from the live map snapshot, not approximated from host URL text
// or fixed viewport constants, or a later two-pin fit can explode visually.
test("overlay interaction projection maps registration pins through the live map snapshot", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "overlay interaction projection maps registration pins through the live map snapshot",
  });
  const port = createOverlayInteractionProjectionPort({
    readState: () => ({
      session: {
        mode: "align",
        placement: {
          x: 20,
          y: 10,
          scale: 2,
          rotationRad: 0,
        },
      },
    }),
    readLastPointerScreenPx: () => null,
    readPageSnapshot: () => pageSnapshot(),
  });

  const projected = port.projectRegistrationPinToggle({
    screenPx: {
      x: 856,
      y: 320,
    },
  });

  assert.equal(projected.kind, "projected");
  assert.equal(projected.existingPinId, null);
  assert.deepEqual(projected.imagePx, {
    x: 418,
    y: 155,
  });
  assert.deepEqual(roundLatLon(projected.mapLatLon), {
    lat: 0,
    lon: 0.351563,
  });

  trace.edge(flowEdge("source.overlay-registration-input", "port.project-registration-pin-toggle", {
    phase: "live-map-snapshot",
    provider: "ui-adapter",
  }));
  trace.edge(flowEdge("port.project-registration-pin-toggle", "sink.projected-registration-pin", {
    phase: "live-map-snapshot",
    terminal: "port-result",
  }));
});

// Class-b: existing-pin removal is a user hit target, not a sub-pixel geometry
// operation. The projection port should match the rendered marker in screen
// space so changing pin marker size changes the removal target with it.
test("overlay interaction projection matches existing pins by visible screen hit target", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "overlay interaction projection matches existing pins by visible screen hit target",
  });
  const port = createOverlayInteractionProjectionPort({
    readState: () => ({
      session: {
        mode: "align",
        placement: {
          x: 20,
          y: 10,
          scale: 1,
          rotationRad: 0,
        },
        registration: {
          pins: [
            {
              id: 7,
              imagePx: {
                x: 580,
                y: 310,
              },
              mapLatLon: {
                lat: 0,
                lon: 0,
              },
            },
          ],
        },
      },
    }),
    readLastPointerScreenPx: () => null,
    readPageSnapshot: () => pageSnapshot(),
  });

  const insideVisibleMarker = port.projectRegistrationPinToggle({
    screenPx: {
      x: 600 + REGISTRATION_PIN_MARKER_HIT_RADIUS_SCREEN_PX,
      y: 320,
    },
  });
  const outsideVisibleMarker = port.projectRegistrationPinToggle({
    screenPx: {
      x: 600 + REGISTRATION_PIN_MARKER_HIT_RADIUS_SCREEN_PX + 1,
      y: 320,
    },
  });

  assert.equal(insideVisibleMarker.kind, "projected");
  assert.equal(insideVisibleMarker.existingPinId, 7);
  assert.deepEqual(insideVisibleMarker.imagePx, {
    x: 580 + REGISTRATION_PIN_MARKER_HIT_RADIUS_SCREEN_PX,
    y: 310,
  });
  assert.equal(outsideVisibleMarker.kind, "projected");
  assert.equal(outsideVisibleMarker.existingPinId, null);
  trace.edge(flowEdge("source.overlay-registration-input", "port.project-registration-pin-toggle", {
    phase: "visible-existing-pin-hit-target",
    provider: "ui-adapter",
  }));
  trace.edge(flowEdge("port.project-registration-pin-toggle", "sink.projected-registration-pin", {
    phase: "visible-existing-pin-hit-target",
    terminal: "port-result",
  }));
});

function pageSnapshot() {
  return {
    kind: "supported-map-page",
    mapView: {
      zoom: 10,
      centerLatLon: {
        lat: 0,
        lon: 0,
      },
    },
    viewportPx: {
      width: 1000,
      height: 540,
    },
    viewportScreenPx: {
      x: 100,
      y: 50,
    },
  };
}

function roundLatLon(point) {
  return {
    lat: Number(point.lat.toFixed(6)),
    lon: Number(point.lon.toFixed(6)),
  };
}
