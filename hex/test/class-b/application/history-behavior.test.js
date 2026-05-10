import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { selectApplicationView } from "../../../application/view-model.js";
import {
  durableStateChangedEffect,
  referenceImageDurableState,
  referenceImageLoadedState,
} from "./reference-image-fixtures.js";

// Class-b, not class-a: record fields and copy may still tighten, but the
// history boundary is principled. Undo/redo replays a semantic record's durable
// before/after states, while the view model exposes that record's user-facing
// labels instead of inventing generic Undo/Redo copy.
test("undoing a load-image history record removes the image and exposes reload", () => {
  const record = {
    kind: "load-reference-image",
    undoLabel: "Remove image",
    redoLabel: "Reload image",
    before: null,
    after: referenceImageDurableState(),
  };
  const state = {
    ...referenceImageLoadedState(),
    history: {
      past: [record],
      future: [],
    },
  };

  assert.deepEqual(selectApplicationView(state).history.undo, {
    enabled: true,
    label: "Remove image",
  });

  const undo = handleApplicationCommand({
    state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.UNDO),
  });

  assert.deepEqual(undo, {
    state: {
      history: {
        past: [],
        future: [record],
      },
    },
    effects: [
      durableStateChangedEffect(null),
    ],
  });
  assert.deepEqual(selectApplicationView(undo.state).history.redo, {
    enabled: true,
    label: "Reload image",
  });
});

// Class-b, not class-a: the exact labels are product copy, but the action
// boundary is settled. A confirmed image removal is a user-visible durable edit,
// so the application records the before/after durable states once and generic
// undo/redo replay them without carrying transient confirmation state forward.
test("confirmed image removal records reloadable undo history", () => {
  const record = {
    kind: "remove-reference-image",
    undoLabel: "Reload image",
    redoLabel: "Remove image",
    before: referenceImageDurableState(),
    after: null,
  };
  const clear = handleApplicationCommand({
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

  assert.deepEqual(clear, {
    state: {
      history: {
        past: [record],
        future: [],
      },
    },
    effects: [
      durableStateChangedEffect(null),
    ],
  });

  const undo = handleApplicationCommand({
    state: clear.state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.UNDO),
  });

  assert.deepEqual(undo, {
    state: {
      ...referenceImageLoadedState(),
      history: {
        past: [],
        future: [record],
      },
    },
    effects: [
      durableStateChangedEffect(referenceImageDurableState()),
    ],
  });
  assert.equal(undo.state.panelIntent, undefined);
  assert.deepEqual(selectApplicationView(undo.state).history.redo, {
    enabled: true,
    label: "Remove image",
  });

  const redo = handleApplicationCommand({
    state: undo.state,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.REDO),
  });

  assert.deepEqual(redo, {
    state: {
      history: {
        past: [record],
        future: [],
      },
    },
    effects: [
      durableStateChangedEffect(null),
    ],
  });
  assert.deepEqual(selectApplicationView(redo.state).history.undo, {
    enabled: true,
    label: "Reload image",
  });
});
