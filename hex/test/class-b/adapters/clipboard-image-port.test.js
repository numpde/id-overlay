import test from "node:test";
import assert from "node:assert/strict";

import {
  createClipboardImagePortAdapter,
} from "../../../adapters/web/clipboard-image-port.js";
import {
  normalizeClipboardImage,
} from "../../../adapters/web/image-normalization.js";

// Class-b: the clipboard adapter translates browser-world outcomes into the
// small plain-data paste vocabulary consumed by the application.
test("clipboard image port reports normalized paste outcomes", async () => {
  for (const { clipboardResult, normalizedImage, expected } of [
    {
      clipboardResult: {
        kind: "empty",
      },
      expected: {
        kind: "empty",
      },
    },
    {
      clipboardResult: {
        kind: "unsupported",
        mimeTypes: ["text/plain"],
      },
      expected: {
        kind: "failed",
        reason: "unsupported-clipboard-content",
      },
    },
    {
      clipboardResult: {
        kind: "image",
        imageHandle: {
          runtimeHandle: "image-1",
        },
      },
      normalizedImage: {
        kind: "failed",
        reason: "decode-failed",
      },
      expected: {
        kind: "failed",
        reason: "decode-failed",
      },
    },
    {
      clipboardResult: {
        kind: "image",
        imageHandle: {
          runtimeHandle: "image-1",
        },
      },
      normalizedImage: {
        kind: "accepted",
        referenceImage: {
          imageDataRef: "reference-image-data-1",
          intrinsicSizePx: {
            width: 640,
            height: 480,
          },
        },
      },
      expected: {
        kind: "accepted",
        referenceImage: {
          imageDataRef: "reference-image-data-1",
          intrinsicSizePx: {
            width: 640,
            height: 480,
          },
        },
      },
    },
  ]) {
    const port = createClipboardImagePortAdapter({
      async readClipboardImageHandle() {
        return clipboardResult;
      },
      async normalizeImageHandle() {
        return normalizedImage;
      },
    });

    const result = await port.readReferenceImage();

    assert.deepEqual(result, expected);
    assertPlainData(result);
  }
});

// Class-b: image decoding may use browser handles internally, but normalized
// output must contain only browser-neutral product facts.
test("image normalization returns only browser-neutral image facts", async () => {
  const result = await normalizeClipboardImage({
    imageHandle: {
      runtimeBlob: new Map([["opaque", true]]),
    },
    decodeImage: async () => ({
      imageDataRef: "reference-image-data-1",
      intrinsicSizePx: {
        width: 640,
        height: 480,
      },
      decodedImageHandle: new Map([["opaque", true]]),
    }),
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
  assertPlainData(result);
});

function assertPlainData(value) {
  if (value === null) {
    return;
  }
  if (Array.isArray(value)) {
    for (const nestedValue of value) {
      assertPlainData(nestedValue);
    }
    return;
  }

  const valueType = typeof value;
  if (["string", "boolean"].includes(valueType)) {
    return;
  }
  if (valueType === "number") {
    assert.equal(Number.isFinite(value), true);
    return;
  }

  assert.equal(valueType, "object");
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const [key, nestedValue] of Object.entries(value)) {
    assert.equal(typeof key, "string");
    assertPlainData(nestedValue);
  }
}
