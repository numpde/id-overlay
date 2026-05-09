import test from "node:test";
import assert from "node:assert/strict";

import { selectApplicationView } from "../../../application/view-model.js";
import {
  firstPin,
  referenceImageLoadedState,
} from "./reference-image-fixtures.js";

// Class-c: concrete status copy is product behavior, but exact wording should
// remain quarantined until the UI model and copy choices settle.
test("application view describes concrete user-visible status", () => {
  for (const { state, status } of [
    {
      state: referenceImageLoadedState(),
      status: "Loaded screenshot 640x480.",
    },
    {
      state: referenceImageLoadedState({
        notice: {
          kind: "cleared-pins",
          count: 1,
        },
      }),
      status: "Cleared 1 pin.",
    },
    {
      state: referenceImageLoadedState({
        pins: [firstPin()],
        panelIntent: {
          kind: "confirm-clear-pins",
        },
      }),
      status: "Click Clear pins? again to remove 1 pin.",
    },
    {
      state: {
        notice: {
          kind: "reference-image-paste-empty",
        },
      },
      status: "Clipboard does not contain an image.",
    },
  ]) {
    assert.equal(selectApplicationView(state).status, status);
  }
});
