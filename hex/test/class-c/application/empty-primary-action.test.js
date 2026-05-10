import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { assertPlainData } from "../../class-b/application/plain-data-assertions.js";

// Class-c: this remaining command-vocabulary check is probably redundant with
// class-a primary-action behavior, but it needs its own promote/delete decision.
// The stale no-session behavior duplicate was deleted because class-a already
// covers the correlated awaiting-paste state authoritatively.

test("application command vocabulary includes primary action activation", () => {
  assert.equal(
    APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    "activate-primary-action",
  );

  const command = createApplicationCommand(
    APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
  );

  assertPlainData(command);
  assert.deepEqual(command, {
    kind: "activate-primary-action",
  });
});
