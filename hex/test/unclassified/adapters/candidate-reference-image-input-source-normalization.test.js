import test from "node:test";
import assert from "node:assert/strict";

import {
  createClipboardImagePortAdapter,
} from "../../../adapters/web/clipboard-image-port.js";

// Unclassified candidate: source-specific browser failures must be normalized
// before an application command exists. The app accepts `unsupported-image`,
// not `unsupported-clipboard-content`, because clipboard is only one possible
// way to obtain a reference image.
test("clipboard source normalizes unsupported content to app failure vocabulary", async () => {
  const port = createClipboardImagePortAdapter({
    async readClipboardImageHandle() {
      return {
        kind: "unsupported",
        mimeTypes: ["text/plain"],
      };
    },
    async normalizeImageHandle() {
      throw new Error("must not normalize unsupported content");
    },
  });

  assert.deepEqual(await port.readReferenceImage(), {
    kind: "failed",
    reason: "unsupported-image",
  });
});

// Unclassified candidate: unavailable browser input is a normal source outcome,
// not an exception that leaks out of the adapter. The shell can decide whether
// another input tactic should be tried, but anything reported to the app must
// use the closed source-neutral failure taxonomy.
test("clipboard source normalizes read failures to source-unavailable", async () => {
  const port = createClipboardImagePortAdapter({
    async readClipboardImageHandle() {
      throw new Error("navigator.clipboard unavailable");
    },
    async normalizeImageHandle() {
      throw new Error("must not normalize missing clipboard content");
    },
  });

  assert.deepEqual(await port.readReferenceImage(), {
    kind: "failed",
    reason: "source-unavailable",
  });
});
