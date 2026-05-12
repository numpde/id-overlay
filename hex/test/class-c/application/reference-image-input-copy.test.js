import test from "node:test";
import assert from "node:assert/strict";

import { selectApplicationView } from "../../../application/view-model.js";

// Class-c: source-neutral image-input copy is the likely destination, but exact
// status strings are not stable enough to override the current class-b view
// model copy. This test also assumes broader non-clipboard input sources that
// are not yet implemented.
//
// Decision: keep quarantined. Promote only after the reference-image input
// lifecycle has a settled source-neutral boundary and the chosen UX copy is
// intentionally revised in the view model.
test("initial reference-image input notices render source-neutral status copy", () => {
  for (const { notice, status } of [
    {
      notice: {
        kind: "reference-image-input-empty",
        requestId: 1,
      },
      status: "No image was provided.",
    },
    {
      notice: {
        kind: "reference-image-input-failed",
        reason: "source-unavailable",
        requestId: 1,
      },
      status: "Image input is unavailable.",
    },
    {
      notice: {
        kind: "reference-image-input-failed",
        reason: "decode-failed",
        requestId: 1,
      },
      status: "Image could not be read.",
    },
    {
      notice: {
        kind: "reference-image-input-failed",
        reason: "unsupported-image",
        requestId: 1,
      },
      status: "Image format is not supported.",
    },
  ]) {
    assertSourceNeutralStatus({
      state: {
        notice,
      },
      status,
    });
  }
});

// Class-c: replacement failure should probably reassure that the current image
// is kept, but the exact copy and status precedence are still UX decisions.
test("replacement input notices render source-neutral keep-current-image copy", () => {
  const session = {
    mode: "align",
    referenceImage: normalizedReferenceImage(),
  };

  for (const { notice, status } of [
    {
      notice: {
        kind: "reference-image-replacement-empty",
        requestId: 1,
      },
      status: "No replacement image was provided. Keeping the current image.",
    },
    {
      notice: {
        kind: "reference-image-replacement-failed",
        reason: "source-unavailable",
        requestId: 1,
      },
      status: "Replacement image input is unavailable. Keeping the current image.",
    },
    {
      notice: {
        kind: "reference-image-replacement-failed",
        reason: "decode-failed",
        requestId: 1,
      },
      status: "Replacement image could not be read. Keeping the current image.",
    },
    {
      notice: {
        kind: "reference-image-replacement-failed",
        reason: "unsupported-image",
        requestId: 1,
      },
      status: "Replacement image format is not supported. Keeping the current image.",
    },
  ]) {
    assertSourceNeutralStatus({
      state: {
        session,
        notice,
      },
      status,
    });
  }
});

function assertSourceNeutralStatus({ state, status }) {
  const actualStatus = selectApplicationView(state).status;

  assert.equal(actualStatus, status);
  assert.equal(/\bclipboard\b|\bpaste\b/i.test(actualStatus), false);
}

function normalizedReferenceImage() {
  return {
    imageDataRef: "reference-image-data-1",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}
