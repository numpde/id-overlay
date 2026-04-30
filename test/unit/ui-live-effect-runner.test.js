import test from "node:test";
import assert from "node:assert/strict";

import { UI_EFFECT_KIND } from "../../src/core/ui-effect-model.js";
import { runUiLiveEffects } from "../../src/core/ui-live-effect-runner.js";

test("runUiLiveEffects executes semantic handlers in order and ignores unknown effects", async () => {
  const seen = [];

  await runUiLiveEffects(
    [
      UI_EFFECT_KIND.REQUEST_PASTE_INPUT,
      UI_EFFECT_KIND.CLEAR_PINS,
      "unknown-effect",
      UI_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
    ],
    {
      requestPasteInput: async () => {
        seen.push("paste");
      },
      clearPins: async () => {
        seen.push("clear-pins");
      },
      clearImage: async () => {
        seen.push("clear-image");
      },
      startPanelTimeout: async () => {
        seen.push("start-timeout");
      },
      cancelPanelTimeout: async () => {
        seen.push("cancel-timeout");
      },
    },
  );

  assert.deepEqual(seen, [
    "paste",
    "clear-pins",
    "cancel-timeout",
  ]);
});
