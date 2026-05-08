import test from "node:test";
import assert from "node:assert/strict";

import {
  CLIPBOARD_IMAGE_READ_KIND,
} from "../../src/core/clipboard-facts.js";
import { createClipboardImageDecoder } from "../../src/content/clipboard-image-decoder.js";
import { IMAGE } from "../helpers/session-fixtures.js";

test("clipboard image decoder turns normalized blobs into decoded image facts", async () => {
  const blob = { type: "image/png" };
  const logs = [];
  const calls = [];
  const decoder = createClipboardImageDecoder({
    logger: {
      info(message, details) {
        logs.push({ message, details });
      },
    },
    imageNormalizationDeps: { dependency: true },
    normalizeImageBlob(candidateBlob, deps) {
      calls.push({ blob: candidateBlob, deps });
      return IMAGE;
    },
  });

  const fact = await decoder.decodeImageBlob(blob, { sourceLabel: "Clipboard API" });

  assert.equal(fact.kind, CLIPBOARD_IMAGE_READ_KIND.DECODED_IMAGE);
  assert.deepEqual(fact.image, IMAGE);
  assert.deepEqual(calls, [{ blob, deps: { dependency: true } }]);
  assert.deepEqual(logs, [{
    message: "Loaded clipboard image",
    details: { source: "Clipboard API" },
  }]);
});

test("clipboard image decoder reports unreadable facts for empty normalization results", async () => {
  const decoder = createClipboardImageDecoder({
    imageNormalizationDeps: null,
    normalizeImageBlob() {
      return null;
    },
  });

  const fact = await decoder.decodeImageBlob({ type: "image/png" });

  assert.deepEqual(fact, {
    kind: CLIPBOARD_IMAGE_READ_KIND.UNREADABLE_IMAGE,
  });
});

test("clipboard image decoder reports unreadable facts and logs thrown normalization failures", async () => {
  const logs = [];
  const decoder = createClipboardImageDecoder({
    logger: {
      warn(message, details) {
        logs.push({ message, details });
      },
    },
    imageNormalizationDeps: null,
    normalizeImageBlob() {
      throw new Error("decode exploded");
    },
  });

  const fact = await decoder.decodeImageBlob({ type: "image/png" }, {
    sourceLabel: "window paste event",
  });

  assert.deepEqual(fact, {
    kind: CLIPBOARD_IMAGE_READ_KIND.UNREADABLE_IMAGE,
  });
  assert.deepEqual(logs, [{
    message: "Clipboard image could not be read",
    details: {
      source: "window paste event",
      message: "decode exploded",
    },
  }]);
});
