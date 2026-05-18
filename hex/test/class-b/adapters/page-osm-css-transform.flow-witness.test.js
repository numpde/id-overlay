import test from "node:test";
import assert from "node:assert/strict";

import {
  cssTransformIsIdentity,
  cssTransformTileFacts,
} from "../../../adapters/shared/css-transform.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b: page observation consumes browser CSS transform strings through the
// shared adapter helper. Identity detection must understand the matrix forms
// emitted by computed styles instead of relying on duplicated exact string
// lists.
test("shared css transform helper recognizes page observation identity forms", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "shared css transform helper recognizes page observation identity forms",
  });

  assert.equal(cssTransformIsIdentity("none"), true);
  assert.equal(cssTransformIsIdentity("translate(0px, 0px)"), true);
  assert.equal(cssTransformIsIdentity("translate(0px)"), true);
  assert.equal(cssTransformIsIdentity("translate3d(0px, 0px, 0px)"), true);
  assert.equal(cssTransformIsIdentity("matrix(1, 0, 0, 1, 0, 0)"), true);
  assert.equal(cssTransformIsIdentity("matrix(1,0,0,1,0,0)"), true);
  assert.equal(cssTransformIsIdentity("matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)"), true);
  assert.equal(cssTransformIsIdentity("translate(1px, 0px)"), false);
  assert.equal(cssTransformIsIdentity("translate3d(0px, 0px, 1px)"), false);
  assert.equal(cssTransformIsIdentity("matrix(1, 0, 0, 1, 18, -12)"), false);
  assert.equal(cssTransformIsIdentity("matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 18, -12, 0, 1)"), false);
  trace.edge(flowEdge("source.css-transform-surface-motion", "sink.page-observation-transform-classification", {
    phase: "identity-transform",
    terminal: "identity-classified",
  }));
});

// Class-b: rendered tile evidence uses transform scale and translation. The
// shared parser should accept both 2D and compositor-promoted 3D matrix syntax.
test("shared css transform helper reads page tile transform facts", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "shared css transform helper reads page tile transform facts",
  });

  assert.deepEqual(cssTransformTileFacts("matrix(2, 0, 0, 2, 7, 8)"), {
    x: 7,
    y: 8,
    scale: 2,
  });
  assert.deepEqual(cssTransformTileFacts("matrix3d(2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1, 0, 7, 8, 0, 1)"), {
    x: 7,
    y: 8,
    scale: 2,
  });
  assert.equal(cssTransformTileFacts("translate3d(7px, 8px, 0px)"), null);
  trace.edge(flowEdge("source.css-transform-tile-motion", "sink.page-observation-transform-facts", {
    phase: "tile-transform",
    terminal: "tile-facts",
  }));
});
