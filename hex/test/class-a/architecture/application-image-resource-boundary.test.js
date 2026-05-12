import test from "node:test";
import assert from "node:assert/strict";

import {
  hexPath,
  listJavaScriptFiles,
  readSource,
  relativeToRepo,
} from "./source-files.js";

// Class-a: reference images enter the app as stable plain refs. Runtime image
// resources, object URL ownership, and image decoding handles belong to
// adapters/renderers; if these words appear in application source, the core is
// taking ownership of resource mechanics instead of product state.
test("application source contains no runtime image-resource mechanics", () => {
  const violations = [];
  for (const filePath of listJavaScriptFiles(hexPath("application"))) {
    const source = readSource(filePath);
    for (const mechanic of FORBIDDEN_APPLICATION_IMAGE_MECHANICS) {
      if (source.includes(mechanic)) {
        violations.push(`${relativeToRepo(filePath)} mentions ${mechanic}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

const FORBIDDEN_APPLICATION_IMAGE_MECHANICS = Object.freeze([
  "objectURL",
  "ObjectURL",
  "createObjectURL",
  "revokeObjectURL",
  "releaseImageDataRef",
  "release-image-data-ref",
  "Blob",
  "File",
  "ImageBitmap",
  "new Image",
  "dataTransfer",
]);
