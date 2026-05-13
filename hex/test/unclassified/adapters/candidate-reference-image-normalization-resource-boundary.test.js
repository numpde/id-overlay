import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeClipboardImage,
} from "../../../adapters/web/image-normalization.js";

// Unclassified candidate: this is the target image-resource boundary, but it depends on a
// shell-owned durable image store and decoded-handle cleanup that do not exist
// yet. Current normalization trusts the decoder to return `imageDataRef`
// directly, so this test must stay out of stable classes.
//
// Decision: keep. The boundary is important, but promoting it before the
// storage/resource port exists would over-specify a single adapter while the
// surrounding lifecycle is still absent.
test("image normalization stores decoded image data behind a durable ref", async () => {
  const calls = {
    stored: [],
    released: [],
  };

  const result = await normalizeClipboardImage({
    imageHandle: {
      runtimeHandle: "clipboard-image",
    },
    async decodeImage(imageHandle) {
      return {
        imageHandle,
        decodedImageHandle: {
          runtimeHandle: "decoded-image",
        },
        temporaryObjectUrl: "blob:https://www.openstreetmap.org/temp-decode",
        intrinsicSizePx: {
          width: 640,
          height: 480,
        },
      };
    },
    async storeReferenceImageData(decodedImage) {
      calls.stored.push(decodedImage);
      return {
        imageDataRef: "reference-image-data-1",
      };
    },
    async releaseDecodedImage(decodedImage) {
      calls.released.push(decodedImage);
    },
  });

  assert.deepEqual(result, {
    kind: "accepted",
    referenceImage: {
      imageDataRef: "reference-image-data-1",
      intrinsicSizePx: {
        width: 640,
        height: 480,
      },
    },
  });
  assert.equal(JSON.stringify(result).includes("blob:"), false);
  assert.equal(JSON.stringify(result).includes("decoded-image"), false);
  assert.equal(calls.stored.length, 1);
  assert.equal(calls.released.length, 1);
});
