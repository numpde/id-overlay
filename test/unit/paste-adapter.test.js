import test from "node:test";
import assert from "node:assert/strict";

import {
  CLIPBOARD_IMAGE_READ_KIND,
  createDecodedClipboardImageFact,
} from "../../src/core/clipboard-facts.js";
import { createClipboardImageReader } from "../../src/content/paste-adapter.js";
import { IMAGE } from "../helpers/session-fixtures.js";

test("clipboard image reader reports unavailable when Clipboard API read is absent", async () => {
  const imageDecoder = createImageDecoderHarness();
  const reader = createClipboardImageReader({
    ownerWindow: { navigator: {} },
    imageDecoder,
  });

  const fact = await reader.readClipboardApiImage();

  assert.deepEqual(fact, {
    kind: CLIPBOARD_IMAGE_READ_KIND.UNAVAILABLE,
  });
  assert.deepEqual(imageDecoder.calls, []);
});

test("clipboard image reader extracts the first Clipboard API image blob", async () => {
  const imageBlob = { type: "image/png" };
  const textBlob = { type: "text/plain" };
  const imageDecoder = createImageDecoderHarness();
  const reader = createClipboardImageReader({
    ownerWindow: {
      navigator: {
        clipboard: {
          async read() {
            return [{
              types: ["text/plain", "image/png"],
              async getType(type) {
                return type === "image/png" ? imageBlob : textBlob;
              },
            }];
          },
        },
      },
    },
    imageDecoder,
  });

  const fact = await reader.readClipboardApiImage();

  assert.deepEqual(fact, createDecodedClipboardImageFact({ image: IMAGE }));
  assert.deepEqual(imageDecoder.calls, [{
    blob: imageBlob,
    options: { sourceLabel: "Clipboard API" },
  }]);
});

test("clipboard image reader reports missing image when Clipboard API has no image item", async () => {
  const logs = [];
  const imageDecoder = createImageDecoderHarness();
  const reader = createClipboardImageReader({
    ownerWindow: {
      navigator: {
        clipboard: {
          async read() {
            return [{ types: ["text/plain"] }];
          },
        },
      },
    },
    logger: {
      warn(message) {
        logs.push(message);
      },
    },
    imageDecoder,
  });

  const fact = await reader.readClipboardApiImage();

  assert.deepEqual(fact, {
    kind: CLIPBOARD_IMAGE_READ_KIND.MISSING_IMAGE,
  });
  assert.deepEqual(logs, ["Clipboard API read succeeded but no image type was present"]);
  assert.deepEqual(imageDecoder.calls, []);
});

test("clipboard image reader extracts paste-event image files", async () => {
  const file = { type: "image/jpeg" };
  const imageDecoder = createImageDecoderHarness();
  const reader = createClipboardImageReader({ imageDecoder });

  const fact = await reader.readClipboardDataImage({
    items: [{
      type: "text/plain",
      getAsFile() {
        return null;
      },
    }, {
      type: "image/jpeg",
      getAsFile() {
        return file;
      },
    }],
  });

  assert.deepEqual(fact, createDecodedClipboardImageFact({ image: IMAGE }));
  assert.deepEqual(imageDecoder.calls, [{
    blob: file,
    options: { sourceLabel: "window paste event" },
  }]);
});

test("clipboard image reader reports unreadable paste-event images when file extraction fails", async () => {
  const logs = [];
  const imageDecoder = createImageDecoderHarness();
  const reader = createClipboardImageReader({
    logger: {
      warn(message) {
        logs.push(message);
      },
    },
    imageDecoder,
  });

  const fact = await reader.readClipboardDataImage({
    items: [{
      type: "image/png",
      getAsFile() {
        return null;
      },
    }],
  });

  assert.deepEqual(fact, {
    kind: CLIPBOARD_IMAGE_READ_KIND.UNREADABLE_IMAGE,
  });
  assert.deepEqual(logs, ["Window paste event image could not be converted to a file"]);
  assert.deepEqual(imageDecoder.calls, []);
});

function createImageDecoderHarness() {
  const calls = [];
  return {
    calls,
    async decodeImageBlob(blob, options) {
      calls.push({ blob, options });
      return createDecodedClipboardImageFact({ image: IMAGE });
    },
  };
}
