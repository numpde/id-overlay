import test from "node:test";
import assert from "node:assert/strict";

import {
  createActiveMapContextAdapter,
} from "../../../adapters/page-osm-id/active-map-context-adapter.js";

// Unclassified candidate: legacy supported OpenStreetMap's canonical edit
// routes, not only the explicit `?editor=id` query. Keep this separate from the
// current class-b page-context test until the supported-route policy is settled.
test("page context accepts legacy OpenStreetMap edit routes", () => {
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

// Unclassified candidate: cross-frame and browser-extension page probes can
// expose throwing location objects. The adapter boundary should normalize that
// to an unsupported-page fact instead of letting bootstrap fail.
test("page context treats inaccessible location as unsupported", () => {
  const adapter = createActiveMapContextAdapter({
    readLocation() {
      throw new Error("cross-origin location");
    },
  });

  assert.deepEqual(adapter.readActiveMapContext(), {
    kind: "unsupported-page",
  });
});
