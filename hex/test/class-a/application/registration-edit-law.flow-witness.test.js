import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-a: Align pins are stored projected facts, not adapter-local gestures.
// Adding a pin must persist the image/map coordinate pair with a stable identity;
// removing that identity must erase the registration facts without unloading.
test("Align pin toggle adds and removes registration facts durably", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "Align pin toggle adds and removes registration facts durably",
  });
  const addCommand = createApplicationCommand(
    APPLICATION_COMMAND_KIND.TOGGLE_REGISTRATION_PIN,
    pinTogglePayload(),
  );
  const add = handleApplicationCommand({
    state: referenceImageLoadedState(),
    command: addCommand,
  });
  traceApplicationResult({
    trace,
    command: addCommand,
    result: add,
    phase: "add",
  });
  const [addedPin] = add.state.session.registration.pins;

  assert.equal(Number.isInteger(addedPin.id), true);
  assert.deepEqual(addedPin.imagePx, firstPin().imagePx);
  assert.deepEqual(addedPin.mapLatLon, firstPin().mapLatLon);
  assert.deepEqual(add.effects, [
    persistDurableStateEffect({
      session: add.state.session,
    }),
  ]);

  const removeCommand = createApplicationCommand(
    APPLICATION_COMMAND_KIND.TOGGLE_REGISTRATION_PIN,
    pinTogglePayload({ existingPinId: addedPin.id }),
  );
  const remove = handleApplicationCommand({
    state: add.state,
    command: removeCommand,
  });
  traceApplicationResult({
    trace,
    command: removeCommand,
    result: remove,
    phase: "remove",
  });

  assert.deepEqual(remove.state.session, {
    mode: "align",
    referenceImage: normalizedReferenceImage(),
  });
  assert.deepEqual(remove.effects, [
    persistDurableStateEffect({
      session: remove.state.session,
    }),
  ]);
  assert.deepEqual(trace.edges, [
    ...durableCommandEdges("command.toggle-registration-pin", { phase: "add" }),
    ...durableCommandEdges("command.toggle-registration-pin", { phase: "remove" }),
  ]);
});

// Class-a: editing registration pins must not disturb an explicitly placed
// overlay. Registration and placement are coupled facts, but pin edits carry
// current placement through state and durability instead of recomputing it.
test("registration pin edits preserve current visible placement", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "registration pin edits preserve current visible placement",
  });
  const placement = {
    x: 80,
    y: 40,
    scale: 1,
    rotationRad: 0,
  };
  const result = handleApplicationCommand({
    state: referenceImageLoadedState({
      placement,
      pins: [firstPin()],
    }),
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.TOGGLE_REGISTRATION_PIN,
      {
        existingPinId: null,
        imagePx: secondPin().imagePx,
        mapLatLon: secondPin().mapLatLon,
      },
    ),
  });
  traceApplicationResult({
    trace,
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.TOGGLE_REGISTRATION_PIN,
      {
        existingPinId: null,
        imagePx: secondPin().imagePx,
        mapLatLon: secondPin().mapLatLon,
      },
    ),
    result,
  });

  assert.deepEqual(result.state.session.placement, placement);
  assert.deepEqual(result.effects, [
    persistDurableStateEffect({
      session: result.state.session,
    }),
  ]);
  assert.deepEqual(trace.edges, durableCommandEdges("command.toggle-registration-pin"));
});

// Class-a: solved registration metadata is valid only for the pin set that
// produced it. Editing pins must preserve the visible placement, but it must
// clear the solved claim so future fit/history behavior cannot trust stale
// derived facts.
test("registration pin edits invalidate solved placement metadata", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "registration pin edits invalidate solved placement metadata",
  });
  const placement = {
    x: 80,
    y: 40,
    scale: 1,
    rotationRad: 0,
  };
  const result = handleApplicationCommand({
    state: referenceImageLoadedState({
      placement,
      pins: [firstPin(), secondPin()],
      solvedPlacement: placement,
    }),
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.TOGGLE_REGISTRATION_PIN,
      {
        existingPinId: null,
        imagePx: thirdPin().imagePx,
        mapLatLon: thirdPin().mapLatLon,
      },
    ),
  });
  traceApplicationResult({
    trace,
    command: createApplicationCommand(
      APPLICATION_COMMAND_KIND.TOGGLE_REGISTRATION_PIN,
      {
        existingPinId: null,
        imagePx: thirdPin().imagePx,
        mapLatLon: thirdPin().mapLatLon,
      },
    ),
    result,
  });

  assert.deepEqual(result.state.session, {
    mode: "align",
    referenceImage: normalizedReferenceImage(),
    placement,
    registration: {
      pins: [firstPin(), secondPin(), thirdPin()],
    },
  });
  assert.deepEqual(result.effects, [
    persistDurableStateEffect({
      session: result.state.session,
    }),
  ]);
  assert.deepEqual(trace.edges, durableCommandEdges("command.toggle-registration-pin"));
});

// Class-a: registration pin edits are semantic image edits, not transient
// overlay affordances. They must be undoable, and the authored history revision
// must land in Align because pins are only visible/editable in Align.
test("registration pin edits create undoable Align-authored history", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "registration pin edits create undoable Align-authored history",
  });
  const command = createApplicationCommand(
    APPLICATION_COMMAND_KIND.TOGGLE_REGISTRATION_PIN,
    pinTogglePayload(),
  );
  const result = handleApplicationCommand({
    state: referenceImageLoadedState({
      mode: "align",
    }),
    command,
  });
  traceApplicationResult({
    trace,
    command,
    result,
  });

  const expectedAfter = {
    session: {
      mode: "align",
      referenceImage: normalizedReferenceImage(),
      registration: {
        pins: [firstPin()],
      },
    },
  };
  assert.deepEqual(result.state.history, {
    past: [{
      kind: "registration-pin-edit",
      before: {
        session: {
          mode: "align",
          referenceImage: normalizedReferenceImage(),
        },
      },
      after: expectedAfter,
    }],
    future: [],
  });

  const undo = handleApplicationCommand({
    state: {
      ...result.state,
      session: {
        ...result.state.session,
        mode: "trace",
      },
    },
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.UNDO),
  });
  traceApplicationResult({
    trace,
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.UNDO),
    result: undo,
    phase: "undo",
  });

  assert.equal(undo.state.session.mode, "align");
  assert.equal(undo.state.session.registration, undefined);
});

// Class-a: durable pin ids are stable identities, but pin-edit notices carry
// the dense visible label for the pin at the time of the edit. Status copy must
// not have to infer a removed pin's former ordinal after the fact.
test("registration pin edit notices carry dense visible labels", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "registration pin edit notices carry dense visible labels",
  });
  const pins = [
    firstPin(),
    secondPin(),
    {
      ...thirdPin(),
      id: 5,
    },
  ];

  const addCommand = createApplicationCommand(
    APPLICATION_COMMAND_KIND.TOGGLE_REGISTRATION_PIN,
    {
      existingPinId: null,
      imagePx: {
        x: 90,
        y: 110,
      },
      mapLatLon: {
        lat: 3,
        lon: 4,
      },
    },
  );
  const add = handleApplicationCommand({
    state: referenceImageLoadedState({
      pins,
    }),
    command: addCommand,
  });
  traceApplicationResult({
    trace,
    command: addCommand,
    result: add,
    phase: "add-with-visible-label",
  });

  assert.equal(add.state.session.registration.pins.at(-1).id, 6);
  assert.deepEqual(add.state.notice, {
    kind: "added-pin",
    pinId: 6,
    pinLabel: "4",
  });

  const removeCommand = createApplicationCommand(
    APPLICATION_COMMAND_KIND.TOGGLE_REGISTRATION_PIN,
    pinTogglePayload({ existingPinId: 5 }),
  );
  const remove = handleApplicationCommand({
    state: referenceImageLoadedState({
      pins,
    }),
    command: removeCommand,
  });
  traceApplicationResult({
    trace,
    command: removeCommand,
    result: remove,
    phase: "remove-with-visible-label",
  });

  assert.deepEqual(remove.state.notice, {
    kind: "removed-pin",
    pinId: 5,
    pinLabel: "3",
  });
});

function traceApplicationResult({
  trace,
  command,
  result,
  phase,
}) {
  const attributes = phase === undefined ? {} : { phase };
  trace.edge(flowEdge(`command.${command.kind}`, "sink.application-state", {
    ...attributes,
    terminal: "state-result",
  }));
  if (result.effects.length === 0) {
    trace.edge(flowEdge(`command.${command.kind}`, "inert.no-effects", {
      ...attributes,
      terminal: "intentionally-inert",
    }));
    return;
  }
  for (const effect of result.effects) {
    trace.edge(flowEdge(`command.${command.kind}`, `effect.${effect.kind}`, {
      ...attributes,
      provider: "application",
    }));
  }
}

function durableCommandEdges(commandNode, attributes = {}) {
  return [
    flowEdge(commandNode, "sink.application-state", {
      ...attributes,
      terminal: "state-result",
    }),
    flowEdge(commandNode, "effect.persist-durable-state", {
      ...attributes,
      provider: "application",
    }),
  ];
}

function referenceImageLoadedState({
  mode = "align",
  placement,
  pins,
  solvedPlacement,
} = {}) {
  const session = {
    mode,
    referenceImage: normalizedReferenceImage(),
  };
  if (placement !== undefined) {
    session.placement = placement;
  }
  if (pins !== undefined) {
    session.registration = {
      pins,
    };
    if (solvedPlacement !== undefined) {
      session.registration.solvedPlacement = solvedPlacement;
    }
  }
  return { session };
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

function firstPin() {
  return {
    id: 1,
    imagePx: {
      x: 320,
      y: 240,
    },
    mapLatLon: {
      lat: -1.23,
      lon: 36.84,
    },
  };
}

function secondPin() {
  return {
    id: 2,
    imagePx: {
      x: 520,
      y: 240,
    },
    mapLatLon: {
      lat: -1.23,
      lon: 38.84,
    },
  };
}

function thirdPin() {
  return {
    id: 3,
    imagePx: {
      x: 420,
      y: 340,
    },
    mapLatLon: {
      lat: -1.24,
      lon: 37.84,
    },
  };
}

function pinTogglePayload({
  existingPinId = null,
  imagePx = firstPin().imagePx,
  mapLatLon = firstPin().mapLatLon,
} = {}) {
  return {
    existingPinId,
    imagePx,
    mapLatLon,
  };
}

function persistDurableStateEffect(durableState) {
  return {
    kind: "persist-durable-state",
    durableState,
  };
}
