import test from "node:test";
import assert from "node:assert/strict";

// Unclassified: panel drag is local chrome, but its stored/restored coordinates
// still need viewport clamping so the panel cannot be dragged offscreen forever.
test("panel position adapter clamps finite panel coordinates to viewport", async () => {
  const { resolvePanelPosition } = await importRequired(
    "../../../adapters/ui/panel-position-adapter.js",
    "resolvePanelPosition",
  );

  assert.deepEqual(resolvePanelPosition({
    requestedScreenPx: {
      x: -40,
      y: 900,
    },
    panelSizePx: {
      width: 240,
      height: 120,
    },
    viewportPx: {
      width: 800,
      height: 600,
    },
  }), {
    x: 0,
    y: 480,
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
