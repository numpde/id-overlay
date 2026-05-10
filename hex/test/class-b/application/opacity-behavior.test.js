import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import {
  referenceImageDurableState,
  referenceImageLoadedState,
} from "./reference-image-fixtures.js";

// Class-b, not class-a: opacity may stop being durable if the product posture
// changes, but while it is durable hydration must accept it. Otherwise opacity
// would be a write-only setting that breaks on the next extension start.
test("durable opacity hydrates into the session", () => {
  const durableState = referenceImageDurableState({
    opacity: 0.5,
  });

  assert.deepEqual(handleApplicationCommand({
    state: {},
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
      durableState,
    }),
  }), {
    state: referenceImageLoadedState({
      opacity: 0.5,
    }),
    effects: [],
  });
});
