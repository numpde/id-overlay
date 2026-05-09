import test from "node:test";
import assert from "node:assert/strict";

// Unclassified: the legacy app downscaled large pasted images once, then used
// one canonical working coordinate space. The exact module name is provisional;
// the product rule is not.
test("image policy constrains oversized images by longest side", async () => {
  const { constrainImageSize } = await importRequired(
    "../../../domain/image-policy.js",
    "constrainImageSize",
  );

  assert.deepEqual(constrainImageSize({
    width: 5000,
    height: 2500,
    maxLongestSide: 2000,
  }), {
    width: 2000,
    height: 1000,
  });
  assert.deepEqual(constrainImageSize({
    width: 640,
    height: 480,
    maxLongestSide: 2000,
  }), {
    width: 640,
    height: 480,
  });
});

// Unclassified: durable image facts should be canonical metadata plus a data
// reference. Legacy compatibility may be accepted at the edge, but app state
// should never carry multiple competing image shapes.
test("image metadata normalization upgrades legacy image shape to canonical facts", async () => {
  const { normalizeReferenceImage } = await importRequired(
    "../../../domain/image-normalization.js",
    "normalizeReferenceImage",
  );

  assert.deepEqual(normalizeReferenceImage({
    dataUrl: "data:image/png;base64,a",
    naturalWidth: 1600,
    naturalHeight: 1200,
    workingWidth: 800,
    workingHeight: 600,
  }), {
    imageDataRef: "data:image/png;base64,a",
    intrinsicSizePx: {
      width: 1600,
      height: 1200,
    },
    workingSizePx: {
      width: 800,
      height: 600,
    },
  });
});

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
