import test from "node:test";
import assert from "node:assert/strict";

import {
  createActiveMapContextAdapter,
} from "../../../adapters/page-osm-id/active-map-context-adapter.js";

// Class-b, deliberately not class-a: supported hosts/editors may grow. The
// stable boundary is that URL/editor detection is page-adapter work that emits
// plain support facts; neither application state nor bootstrap parses page
// details.
test("page context adapter accepts OpenStreetMap edit routes", () => {
  for (const location of [
    {
      origin: "https://www.openstreetmap.org",
      pathname: "/edit",
      search: "",
    },
    {
      origin: "https://www.openstreetmap.org",
      pathname: "/edit",
      search: "?editor=id",
    },
    {
      origin: "https://www.openstreetmap.org",
      pathname: "/edit/history",
      search: "",
    },
  ]) {
    assert.deepEqual(createActiveMapContextAdapter({
      readLocation: () => location,
      findEmbeddedEditorFrame: () => null,
    }).readActiveMapContext(), {
      kind: "supported-map-editor-page",
      surface: {
        kind: "native-page",
      },
    });
  }
});

test("page context adapter rejects non-edit and non-OpenStreetMap pages", () => {
  for (const location of [
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

test("page context adapter treats inaccessible location as unsupported", () => {
  const adapter = createActiveMapContextAdapter({
    readLocation() {
      throw new Error("cross-origin location");
    },
  });

  assert.deepEqual(adapter.readActiveMapContext(), {
    kind: "unsupported-page",
  });
});
