import test from "node:test";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { createInitialApplicationState } from "../../../application/state.js";
import { assertApplicationResult } from "./application-result-assertions.js";
import {
  durableStateChangedEffect,
  firstPin,
  referenceImageDurableState,
  referenceImageLoadedState,
} from "./reference-image-fixtures.js";

// Class-b, not class-a: clear-pins is part of the current primary-button ladder
// and its notice vocabulary is product policy. The durable requirement is still
// important: confirming must persist the registration-free session and remove
// the destructive confirmation.
test("primary action confirms clear-pins when clear-pins confirmation is active", () => {
  const result = handleApplicationCommand({
    state: {
      ...referenceImageLoadedState({
        pins: [firstPin()],
      }),
      panelIntent: {
        kind: "confirm-clear-pins",
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assertApplicationResult(result, {
    state: {
      ...referenceImageLoadedState(),
      notice: {
        kind: "cleared-pins",
        count: 1,
      },
    },
    effects: [
      durableStateChangedEffect(referenceImageDurableState()),
    ],
  });
});

// Class-b, not class-a: confirming image removal currently records a reloadable
// undo point, clears durable state, and collapses the visible session. The exact
// confirmation and history labels remain product/API vocabulary.
test("primary action confirms clear-image when clear-image confirmation is active", () => {
  const record = {
    kind: "remove-reference-image",
    undoLabel: "Reload image",
    redoLabel: "Remove image",
    before: referenceImageDurableState(),
    after: null,
  };
  const result = handleApplicationCommand({
    state: {
      ...referenceImageLoadedState(),
      panelIntent: {
        kind: "confirm-clear-reference-image",
      },
    },
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.ACTIVATE_PRIMARY_ACTION,
    ),
  });

  assertApplicationResult(result, {
    state: {
      ...createInitialApplicationState(),
      history: {
        past: [record],
        future: [],
      },
    },
    effects: [
      durableStateChangedEffect(null),
    ],
  });
});
