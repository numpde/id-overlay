import test from "node:test";
import assert from "node:assert/strict";

// Class-c: canonical image facts are settled, but accepting legacy image shape
// is a migration policy, not bedrock domain behavior. Keep the proposal visible
// without weakening the current boundary rule that unsupported durable data is
// rejected until migration exists.
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
