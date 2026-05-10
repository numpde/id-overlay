import test from "node:test";
import assert from "node:assert/strict";

import {
  createActiveMapContextAdapter,
} from "../../../adapters/page-osm-id/active-map-context-adapter.js";

// Class-b, deliberately not class-a: supported hosts/editors may grow. The
// stable boundary is that URL/editor detection is page-adapter work that emits
// plain support facts; neither application state nor bootstrap parses page
// details.
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
