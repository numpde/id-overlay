import test from "node:test";
import assert from "node:assert/strict";

import {
  createActiveMapContextAdapter,
} from "../../../adapters/page-osm-id/active-map-context-adapter.js";

// Class-b, not class-a: exact page-support policy may grow with more hosts or
// editors, but the boundary is stable. Page context detection belongs in a page
// adapter and produces a plain support fact; neither application state nor
// bootstrap should parse OpenStreetMap URL details.
test("page context adapter accepts only OpenStreetMap iD edit pages", () => {
  const adapter = createActiveMapContextAdapter({
    readLocation: () => ({
      origin: "https://www.openstreetmap.org",
      pathname: "/edit",
      search: "?editor=id",
    }),
    findEmbeddedEditorFrame: () => null,
  });

  assert.deepEqual(adapter.readActiveMapContext(), {
    kind: "supported-map-editor-page",
    surface: {
      kind: "native-page",
    },
  });

  for (const location of [
    {
      origin: "https://www.openstreetmap.org",
      pathname: "/edit",
      search: "?editor=potlatch",
    },
    {
      origin: "https://www.openstreetmap.org",
      pathname: "/",
      search: "?editor=id",
    },
    {
      origin: "https://example.com",
      pathname: "/edit",
      search: "?editor=id",
    },
  ]) {
    assert.deepEqual(createActiveMapContextAdapter({
      readLocation: () => location,
    }).readActiveMapContext(), {
      kind: "unsupported-page",
    });
  }
});
