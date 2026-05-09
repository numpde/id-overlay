import test from "node:test";
import assert from "node:assert/strict";

// Class-c: page support detection belongs in a page adapter, not in the
// application. The exact adapter name and supported-page fact shape are still
// unsettled, so this remains a quarantined target until that seam is designed.
test("page adapter accepts only supported OpenStreetMap edit contexts", async () => {
  const { createActiveMapContextAdapter } = await importRequired(
    "../../../adapters/page-osm-id/active-map-context-adapter.js",
    "createActiveMapContextAdapter",
  );
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
});

async function importRequired(specifier, exportName) {
  let module;
  try {
    module = await import(specifier);
  } catch {
    assert.fail(`missing module ${specifier}`);
  }
  if (typeof module[exportName] !== "function") {
    assert.fail(`missing export ${exportName} from ${specifier}`);
  }
  return module;
}
