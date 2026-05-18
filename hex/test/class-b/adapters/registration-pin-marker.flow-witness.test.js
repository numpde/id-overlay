import test from "node:test";
import assert from "node:assert/strict";

import {
  REGISTRATION_MAP_PIN_MARKER_PRESENTATION,
  REGISTRATION_OVERLAY_PIN_MARKER_PRESENTATION,
  REGISTRATION_PIN_MARKER_TONE_PRESENTATION,
  REGISTRATION_PIN_MARKER_HIT_TARGET_MIN_SIZE_PX,
  registrationPinMarkerHitRadiusScreenPx,
  registrationPinMarkerTonePresentation,
} from "../../../adapters/ui/registration-pin-marker.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b: marker hit geometry is a UI contract. The visible marker defines the
// normal deletion target, but shrinking the marker must not make deleting pins
// impractically small.
test("registration pin marker hit target follows visible size with a minimum", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "registration pin marker hit target follows visible size with a minimum",
  });

  assert.equal(registrationPinMarkerHitRadiusScreenPx({
    markerSizePx: REGISTRATION_OVERLAY_PIN_MARKER_PRESENTATION.sizePx,
  }), REGISTRATION_OVERLAY_PIN_MARKER_PRESENTATION.sizePx / 2);
  assert.equal(registrationPinMarkerHitRadiusScreenPx({
    markerSizePx: 8,
  }), REGISTRATION_PIN_MARKER_HIT_TARGET_MIN_SIZE_PX / 2);
  assert.equal(registrationPinMarkerHitRadiusScreenPx({
    markerSizePx: REGISTRATION_PIN_MARKER_HIT_TARGET_MIN_SIZE_PX,
  }), REGISTRATION_PIN_MARKER_HIT_TARGET_MIN_SIZE_PX / 2);
  trace.edge(flowEdge("source.registration-pin-marker-geometry", "port.registration-pin-hit-test", {
    phase: "hit-target-minimum",
    provider: "ui-adapter",
  }));
  trace.edge(flowEdge("port.registration-pin-hit-test", "sink.pin-deletion-target", {
    phase: "hit-target-minimum",
    terminal: "adapter-contract",
  }));
});

// Class-b: the same registration fact appears in two coordinate spaces. Both
// markers use the same geometry so they scale together with their rendered
// coordinate spaces; the map-space marker differs only by alpha.
test("registration pin marker presentations are role-specific", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "registration pin marker presentations are role-specific",
  });

  assert.deepEqual(REGISTRATION_OVERLAY_PIN_MARKER_PRESENTATION, {
    sizePx: 42,
    borderPx: 6,
    fontPx: 30,
    opacity: 1,
  });
  assert.deepEqual(REGISTRATION_MAP_PIN_MARKER_PRESENTATION, {
    sizePx: 42,
    borderPx: 6,
    fontPx: 30,
    opacity: 0.55,
  });
  assert.equal(
    REGISTRATION_MAP_PIN_MARKER_PRESENTATION.sizePx,
    REGISTRATION_OVERLAY_PIN_MARKER_PRESENTATION.sizePx,
  );
  trace.edge(flowEdge("source.registration-pin-marker-geometry", "sink.rendered-overlay", {
    phase: "role-specific-marker-presentations",
    terminal: "adapter-contract",
  }));
});

// Class-b: pin tone is part of the marker presentation contract, not an
// incidental renderer color. Unknown tones fall back to the normal marker so
// malformed view data cannot invent visual states.
test("registration pin marker tone presentation is centralized", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "registration pin marker tone presentation is centralized",
  });

  assert.deepEqual(REGISTRATION_PIN_MARKER_TONE_PRESENTATION, {
    normal: {
      tone: "normal",
      background: "rgba(37, 99, 235, 0.92)",
    },
    danger: {
      tone: "danger",
      background: "rgba(220, 38, 38, 0.92)",
    },
  });
  assert.equal(
    registrationPinMarkerTonePresentation("normal"),
    REGISTRATION_PIN_MARKER_TONE_PRESENTATION.normal,
  );
  assert.equal(
    registrationPinMarkerTonePresentation("danger"),
    REGISTRATION_PIN_MARKER_TONE_PRESENTATION.danger,
  );
  assert.equal(
    registrationPinMarkerTonePresentation("unexpected"),
    REGISTRATION_PIN_MARKER_TONE_PRESENTATION.normal,
  );
  trace.edge(flowEdge("source.registration-pin-marker-geometry", "sink.rendered-overlay", {
    phase: "centralized-marker-tone",
    terminal: "adapter-contract",
  }));
});
