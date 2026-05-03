import test from "node:test";
import assert from "node:assert/strict";

import {
  describeLoadedImagePresentation,
  describeRuntimeErrorPresentation,
} from "../../src/core/presentation.js";
import { RUNTIME_ERROR_SOURCE } from "../../src/core/runtime-error.js";

test("runtime error presentation is centralized", () => {
  assert.equal(
    describeRuntimeErrorPresentation({
      source: RUNTIME_ERROR_SOURCE.OVERLAY,
      message: "ignored",
    }),
    "The overlay gesture failed. Try the action again.",
  );
  assert.equal(
    describeRuntimeErrorPresentation({
      source: RUNTIME_ERROR_SOURCE.PAGE_ADAPTER,
      message: "ignored",
    }),
    "The map bridge failed temporarily. Try the action again.",
  );
  assert.equal(
    describeRuntimeErrorPresentation({
      source: RUNTIME_ERROR_SOURCE.INTERACTIONS,
      message: "ignored",
    }),
    "The overlay interaction failed. Try the action again.",
  );
});

test("loaded image presentation is centralized", () => {
  assert.equal(
    describeLoadedImagePresentation({
      src: "data:image/png;base64,abc",
      width: 640,
      height: 320,
      original: {
        width: 640,
        height: 320,
      },
      working: {
        src: "data:image/png;base64,abc",
        width: 640,
        height: 320,
        scaleFromOriginal: 1,
      },
    }),
    "Loaded screenshot 640×320.",
  );
  assert.equal(
    describeLoadedImagePresentation({
      src: "data:image/png;base64,resized",
      width: 2048,
      height: 1024,
      original: {
        width: 5000,
        height: 2500,
      },
      working: {
        src: "data:image/png;base64,resized",
        width: 2048,
        height: 1024,
        scaleFromOriginal: 2048 / 5000,
      },
    }),
    "Loaded screenshot 2048×1024 from 5000×2500.",
  );
});
