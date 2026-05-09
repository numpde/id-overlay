import test from "node:test";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { assertApplicationResult } from "./application-result-assertions.js";
import {
  firstPin,
  pinTogglePayload,
  referenceImageLoadedState,
  secondPin,
} from "./reference-image-fixtures.js";

// Class-b: pins are invisible in Trace, so pin mutation commands are invalid
// there from the user's perspective. Exact command names remain API vocabulary.
test("pin edits and clear-pins are no-ops in Trace mode", () => {
  const state = referenceImageLoadedState({
    mode: "trace",
    pins: [firstPin()],
  });

  for (const command of [
    createApplicationCommand(
      APPLICATION_COMMAND_KIND.TOGGLE_REGISTRATION_PIN,
      pinTogglePayload({
        imagePx: secondPin().imagePx,
        mapLatLon: secondPin().mapLatLon,
      }),
    ),
    createApplicationCommand(APPLICATION_COMMAND_KIND.CLEAR_REGISTRATION_PINS),
  ]) {
    assertApplicationResult(handleApplicationCommand({ state, command }), {
      state,
      effects: [],
    });
  }
});
