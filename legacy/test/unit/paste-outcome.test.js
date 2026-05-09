import test from "node:test";
import assert from "node:assert/strict";

import {
  CLIPBOARD_IMAGE_READ_KIND,
  createClipboardImageFailureFact,
  createClipboardUnavailableFact,
  createDecodedClipboardImageFact,
} from "../../src/core/clipboard-facts.js";
import {
  MACHINE_PASTE_READ_OUTCOME_KIND,
  createPasteReadOutcomeFromClipboardFact,
} from "../../src/core/machine/paste-read.js";
import {
  IMAGE,
  PLACEMENT,
} from "../helpers/session-fixtures.js";

test("decoded clipboard image fact becomes an explicitly placed paste outcome", () => {
  const outcome = createPasteReadOutcomeFromClipboardFact({
    fact: createDecodedClipboardImageFact({ image: IMAGE }),
    placement: PLACEMENT,
  });

  assert.deepEqual(outcome, {
    kind: MACHINE_PASTE_READ_OUTCOME_KIND.DECODED_IMAGE,
    image: IMAGE,
    placement: PLACEMENT,
  });
});

test("clipboard failure facts become paste failure outcomes", () => {
  assert.deepEqual(createPasteReadOutcomeFromClipboardFact({
    fact: createClipboardImageFailureFact({
      kind: CLIPBOARD_IMAGE_READ_KIND.MISSING_IMAGE,
    }),
  }), {
    kind: MACHINE_PASTE_READ_OUTCOME_KIND.CLIPBOARD_FAILURE,
    failureKind: CLIPBOARD_IMAGE_READ_KIND.MISSING_IMAGE,
  });

  assert.deepEqual(createPasteReadOutcomeFromClipboardFact({
    fact: createClipboardImageFailureFact({
      kind: CLIPBOARD_IMAGE_READ_KIND.UNREADABLE_IMAGE,
    }),
  }), {
    kind: MACHINE_PASTE_READ_OUTCOME_KIND.CLIPBOARD_FAILURE,
    failureKind: CLIPBOARD_IMAGE_READ_KIND.UNREADABLE_IMAGE,
  });
});

test("clipboard unavailable fact keeps paste armed for manual paste fallback", () => {
  assert.equal(createPasteReadOutcomeFromClipboardFact({
    fact: createClipboardUnavailableFact(),
  }), null);
});
