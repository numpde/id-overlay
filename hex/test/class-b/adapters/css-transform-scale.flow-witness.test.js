import test from "node:test";
import assert from "node:assert/strict";

import {
  cssTransformAverageScale,
} from "../../../adapters/shared/css-transform.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b: CSS transform parsing is adapter-local browser syntax handling. The
// product contract is simpler: surface motion exposes a transform string, and
// marker chrome needs a stable average screen scale for counter-scaling glyphs.
test("css transform scale reads browser matrix surface motion", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "css transform scale reads browser matrix surface motion",
  });

  assert.equal(cssTransformAverageScale("none"), 1);
  assert.equal(cssTransformAverageScale("matrix(2, 0, 0, 2, 7, 8)"), 2);
  assert.equal(cssTransformAverageScale(" matrix(0.5, 0, 0, 0.25, 7, 8) "), 0.375);
  assert.equal(cssTransformAverageScale("matrix(0, 2, -3, 0, 7, 8)"), 2.5);
  assert.equal(cssTransformAverageScale("matrix(1e-1, 0, 0, 2.5e+0, 7, 8)"), 1.3);
  trace.edge(flowEdge("source.css-transform-surface-motion", "sink.marker-counter-scale", {
    phase: "matrix-scale",
    terminal: "parsed-scale",
  }));
});

// Class-b: browsers and map libraries may express promoted/composited motion as
// matrix3d. Falling back to scale 1 for that valid syntax makes map-location
// pin glyphs grow and shrink with the map.
test("css transform scale reads browser matrix3d surface motion", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "css transform scale reads browser matrix3d surface motion",
  });

  assert.equal(
    cssTransformAverageScale("matrix3d(2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1, 0, 7, 8, 0, 1)"),
    2,
  );
  assert.equal(
    cssTransformAverageScale("matrix3d(0, 2, 0, 0, -4, 0, 0, 0, 0, 0, 1, 0, 7, 8, 0, 1)"),
    3,
  );
  trace.edge(flowEdge("source.css-transform-surface-motion", "sink.marker-counter-scale", {
    phase: "matrix3d-scale",
    terminal: "parsed-scale",
  }));
});

// Class-b: unsupported transform syntax is not an application error. The
// adapter chooses the non-destructive fallback of no counter-scale.
test("css transform scale falls back to identity for unsupported syntax", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "css transform scale falls back to identity for unsupported syntax",
  });

  assert.equal(cssTransformAverageScale("translate3d(10px, 20px, 0px)"), 1);
  assert.equal(cssTransformAverageScale("matrix(1, 0, 0, 1, 0)"), 1);
  assert.equal(cssTransformAverageScale("matrix3d(1, 0, 0, 0)"), 1);
  assert.equal(cssTransformAverageScale("matrix(1, nope, 0, 1, 0, 0)"), 1);
  trace.edge(flowEdge("source.css-transform-surface-motion", "sink.marker-counter-scale", {
    phase: "unsupported-transform-fallback",
    terminal: "identity-scale",
  }));
});
