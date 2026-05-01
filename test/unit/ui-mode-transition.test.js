import test from "node:test";
import assert from "node:assert/strict";

import { UI_EFFECT_KIND } from "../../src/core/ui-effect-model.js";
import { UI_EVENT_KIND } from "../../src/core/ui-event-model.js";
import {
  resolveModeTransitionBasis,
  transitionMode,
} from "../../src/core/ui-mode-transition.js";
import {
  createInitialUiState,
  UI_MODE_KIND,
} from "../../src/core/ui-state-model.js";
import { deepFreeze } from "../helpers/deep-freeze.js";

test("mode transition basis captures only local mode-switch distinctions", () => {
  const base = createInitialUiState();
  const state = {
    ...base,
    session: {
      ...base.session,
      mode: UI_MODE_KIND.ALIGN,
      image: { id: "image" },
      registration: {
        pins: [{ id: 1 }, { id: 2 }],
        solvedTransform: null,
        dirty: true,
      },
    },
  };

  assert.deepEqual(resolveModeTransitionBasis(state, UI_MODE_KIND.TRACE), {
    currentMode: UI_MODE_KIND.ALIGN,
    nextMode: UI_MODE_KIND.TRACE,
    hasImage: true,
    registrationStatus: "dirty",
  });
});

test("selecting the current mode is a no-op", () => {
  const state = createInitialUiState();
  const result = transitionMode(state, {
    kind: UI_EVENT_KIND.MODE_SELECTED,
    mode: UI_MODE_KIND.TRACE,
  });

  assert.equal(result.state, state);
  assert.deepEqual(result.effects, []);
});

test("selecting an unknown mode is a pure no-op", () => {
  const state = createInitialUiState();
  const result = transitionMode(state, {
    kind: UI_EVENT_KIND.MODE_SELECTED,
    mode: "bogus-mode",
  });

  assert.equal(result.state, state);
  assert.deepEqual(result.effects, []);
});

test("selecting align with no image is a no-op", () => {
  const state = createInitialUiState();
  const result = transitionMode(state, {
    kind: UI_EVENT_KIND.MODE_SELECTED,
    mode: UI_MODE_KIND.ALIGN,
  });

  assert.equal(result.state, state);
  assert.deepEqual(result.effects, []);
});

test("trace switch with no image updates mode without requesting solve", () => {
  const state = {
    ...createInitialUiState(),
    session: {
      ...createInitialUiState().session,
      mode: UI_MODE_KIND.ALIGN,
    },
  };

  const result = transitionMode(state, {
    kind: UI_EVENT_KIND.MODE_SELECTED,
    mode: UI_MODE_KIND.TRACE,
  });

  assert.equal(result.state.session.mode, UI_MODE_KIND.TRACE);
  assert.deepEqual(result.effects, []);
});

test("trace switch with dirty solvable registration requests solve and still switches mode", () => {
  const base = createInitialUiState();
  const state = {
    ...base,
    session: {
      ...base.session,
      mode: UI_MODE_KIND.ALIGN,
      image: { id: "image" },
      registration: {
        pins: [{ id: 1 }, { id: 2 }],
        solvedTransform: null,
        dirty: true,
      },
    },
  };

  const result = transitionMode(state, {
    kind: UI_EVENT_KIND.MODE_SELECTED,
    mode: UI_MODE_KIND.TRACE,
  });

  assert.equal(result.state.session.mode, UI_MODE_KIND.TRACE);
  assert.deepEqual(result.effects, [UI_EFFECT_KIND.REQUEST_REGISTRATION_SOLVE]);
});

test("trace switch with insufficient pins does not request solve", () => {
  const base = createInitialUiState();
  const state = {
    ...base,
    session: {
      ...base.session,
      mode: UI_MODE_KIND.ALIGN,
      image: { id: "image" },
      registration: {
        pins: [{ id: 1 }],
        solvedTransform: null,
        dirty: true,
      },
    },
  };

  const result = transitionMode(state, {
    kind: UI_EVENT_KIND.MODE_SELECTED,
    mode: UI_MODE_KIND.TRACE,
  });

  assert.equal(result.state.session.mode, UI_MODE_KIND.TRACE);
  assert.deepEqual(result.effects, []);
});

test("trace switch with ready registration does not request solve", () => {
  const base = createInitialUiState();
  const state = {
    ...base,
    session: {
      ...base.session,
      mode: UI_MODE_KIND.ALIGN,
      image: { id: "image" },
      registration: {
        pins: [{ id: 1 }, { id: 2 }],
        solvedTransform: null,
        dirty: false,
      },
    },
  };

  const result = transitionMode(state, {
    kind: UI_EVENT_KIND.MODE_SELECTED,
    mode: UI_MODE_KIND.TRACE,
  });

  assert.equal(result.state.session.mode, UI_MODE_KIND.TRACE);
  assert.deepEqual(result.effects, []);
});

test("trace switch with solved registration does not request solve", () => {
  const base = createInitialUiState();
  const solvedTransform = {
    type: "similarity",
    scale: 1.1,
    rotationRad: 0.2,
    translate: { x: 1, y: 2 },
    pinCount: 2,
  };
  const state = {
    ...base,
    session: {
      ...base.session,
      mode: UI_MODE_KIND.ALIGN,
      image: { id: "image" },
      registration: {
        pins: [{ id: 1 }, { id: 2 }],
        solvedTransform,
        dirty: false,
      },
    },
  };

  const result = transitionMode(state, {
    kind: UI_EVENT_KIND.MODE_SELECTED,
    mode: UI_MODE_KIND.TRACE,
  });

  assert.equal(result.state.session.mode, UI_MODE_KIND.TRACE);
  assert.deepEqual(result.effects, []);
});

test("solve success stores solved transform and clears registration dirtiness", () => {
  const base = createInitialUiState();
  const state = {
    ...base,
    session: {
      ...base.session,
      mode: UI_MODE_KIND.TRACE,
      image: { id: "image" },
      registration: {
        pins: [{ id: 1 }, { id: 2 }],
        solvedTransform: null,
        dirty: true,
      },
    },
  };
  const solvedTransform = {
    type: "similarity",
    scale: 1.2,
    rotationRad: 0.1,
    translate: { x: 4, y: 5 },
    pinCount: 2,
  };

  const result = transitionMode(state, {
    kind: UI_EVENT_KIND.SOLVE_SUCCEEDED,
    solvedTransform,
  });

  assert.deepEqual(result.state.session.registration, {
    pins: [{ id: 1 }, { id: 2 }],
    solvedTransform,
    dirty: false,
  });
  assert.deepEqual(result.effects, []);
});

test("solve success without an image is ignored", () => {
  const state = createInitialUiState();
  const result = transitionMode(state, {
    kind: UI_EVENT_KIND.SOLVE_SUCCEEDED,
    solvedTransform: { type: "similarity" },
  });

  assert.equal(result.state, state);
  assert.deepEqual(result.effects, []);
});

test("solve success with the same solved transform is a no-op", () => {
  const solvedTransform = {
    type: "similarity",
    scale: 1.2,
    rotationRad: 0.1,
    translate: { x: 4, y: 5 },
    pinCount: 2,
  };
  const base = createInitialUiState();
  const state = {
    ...base,
    session: {
      ...base.session,
      mode: UI_MODE_KIND.TRACE,
      image: { id: "image" },
      registration: {
        pins: [{ id: 1 }, { id: 2 }],
        solvedTransform,
        dirty: false,
      },
    },
  };

  const result = transitionMode(state, {
    kind: UI_EVENT_KIND.SOLVE_SUCCEEDED,
    solvedTransform,
  });

  assert.equal(result.state, state);
  assert.deepEqual(result.effects, []);
});

test("solve failed does not mutate canonical state", () => {
  const state = {
    ...createInitialUiState(),
    session: {
      ...createInitialUiState().session,
      mode: UI_MODE_KIND.TRACE,
      image: { id: "image" },
      registration: {
        pins: [{ id: 1 }, { id: 2 }],
        solvedTransform: null,
        dirty: true,
      },
    },
  };

  const result = transitionMode(state, {
    kind: UI_EVENT_KIND.SOLVE_FAILED,
    reason: "solve-failed",
  });

  assert.equal(result.state, state);
  assert.deepEqual(result.effects, []);
});

test("mode transitions do not mutate frozen input state or event payloads", () => {
  const state = deepFreeze({
    ...createInitialUiState(),
    session: {
      ...createInitialUiState().session,
      mode: UI_MODE_KIND.ALIGN,
      image: { id: "image" },
      registration: {
        pins: [{ id: 1 }, { id: 2 }],
        solvedTransform: null,
        dirty: true,
      },
    },
  });
  const event = deepFreeze({
    kind: UI_EVENT_KIND.MODE_SELECTED,
    mode: UI_MODE_KIND.TRACE,
  });

  const result = transitionMode(state, event);

  assert.equal(state.session.mode, UI_MODE_KIND.ALIGN);
  assert.equal(result.state.session.mode, UI_MODE_KIND.TRACE);
  assert.deepEqual(result.effects, [UI_EFFECT_KIND.REQUEST_REGISTRATION_SOLVE]);
  assert.equal(Object.isFrozen(result.effects), true);
});
