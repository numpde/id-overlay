import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { assertPlainData } from "./plain-data-assertions.js";

// Class-b: exact command names are product vocabulary, but the boundary law is
// stable: callers submit inert data. Commands must not smuggle callbacks, host
// objects, or execution policy into the application core.
test("application commands are inert plain-data envelopes", () => {
  assert.equal(APPLICATION_COMMAND_KIND.HYDRATE, "hydrate");

  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
    durableState: null,
  });

  assertPlainData(command);
  assert.deepEqual(command, {
    kind: "hydrate",
    durableState: null,
  });
});
