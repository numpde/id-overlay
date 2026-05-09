import test from "node:test";
import assert from "node:assert/strict";

// Unclassified: wheel scale/rotate around a point should keep the image point
// under the pointer stable. This is the geometric core of "edit what I am
// pointing at", independent of DOM wheel events.
test("anchored placement edits keep the anchor fixed in screen space", async () => {
  const { applyAnchoredPlacementEdit, applyPlacementToPoint } = await importRequired(
    "../../../domain/placement.js",
    "applyAnchoredPlacementEdit",
  );
  const base = {
    x: 80,
    y: 40,
    scale: 1,
    rotationRad: 0,
  };
  const imagePx = {
    x: 320,
    y: 240,
  };
  const before = applyPlacementToPoint(imagePx, base);

  for (const edit of [
    {
      kind: "scale",
      factor: 1.2,
      anchorImagePx: imagePx,
    },
    {
      kind: "rotate",
      deltaRad: Math.PI / 8,
      anchorImagePx: imagePx,
    },
  ]) {
    const placement = applyAnchoredPlacementEdit({
      base,
      edit,
    });
    assert.deepEqual(roundPoint(applyPlacementToPoint(imagePx, placement)), roundPoint(before));
  }
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

function roundPoint(point) {
  return {
    x: Number(point.x.toFixed(6)),
    y: Number(point.y.toFixed(6)),
  };
}
