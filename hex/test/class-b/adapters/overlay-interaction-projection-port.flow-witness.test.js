import test from "node:test";
import assert from "node:assert/strict";

import {
  createOverlayInteractionProjectionPort,
} from "../../../adapters/ui/overlay-interaction-projection-port.js";
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
