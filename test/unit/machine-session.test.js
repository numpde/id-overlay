import test from "node:test";
import assert from "node:assert/strict";

import {
  MACHINE_HISTORY_KIND,
  MACHINE_MODE,
  MACHINE_PANEL_INTENT,
} from "../../src/core/machine/events.js";
import {
  selectOverlayPolicy,
} from "../../src/core/machine/policy.js";
import {
  selectPanelStatusText,
} from "../../src/core/machine/selectors.js";
import {
  addPin,
  createHost,
  createLoadedHost,
  loadImage,
  NORMALIZED_IMAGE,
  PLACEMENT,
  state,
} from "../helpers/machine-scenarios.js";

test("initial no-image state is native Trace with paste as the primary action", () => {
  const currentState = state(createHost());

  assert.equal(currentState.session.mode, MACHINE_MODE.TRACE);
  assert.equal(currentState.session.image, null);
  assert.equal(selectPanelStatusText(currentState), "Paste a screenshot to begin.");
  assert.deepEqual(selectOverlayPolicy(currentState), {
    hasImage: false,
    mode: MACHINE_MODE.TRACE,
    isNativeMapInput: true,
    isPassThrough: true,
    canEditOverlay: false,
    arePinsVisible: false,
    ownsPointerHitTesting: false,
  });
});

test("loading an image enters Align and records a user-facing reloadable edit", () => {
  const result = loadImage(createHost());

  assert.equal(result.state.session.mode, MACHINE_MODE.ALIGN);
  assert.deepEqual(result.state.session.image, NORMALIZED_IMAGE);
  assert.deepEqual(result.state.session.placement, PLACEMENT);
  assert.equal(result.historyRecord.kind, MACHINE_HISTORY_KIND.LOAD_IMAGE);
  assert.equal(selectPanelStatusText(result.state), "Loaded screenshot 800\u00d7400.");
  assert.equal(result.state.history.future.length, 0);
  assert.equal(result.state.history.past.length, 1);
});

test("invalid mode selection is a pure no-op", () => {
  const host = createLoadedHost();
  const before = state(host);

  const result = host.selectMode("invalid");

  assert.deepEqual(result.state, before);
  assert.deepEqual(result.effects, []);
  assert.equal(result.historyRecord, null);
});

test("selectors derive panel intent, status, controls, and pass-through", () => {
  const host = createLoadedHost();
  host.requestPanelIntent(MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM);
  let currentState = state(host);

  assert.equal(
    selectPanelStatusText(currentState),
    "Click Clear image? again to remove the current screenshot, placement, and pins.",
  );
  assert.deepEqual(selectOverlayPolicy(currentState), {
    hasImage: true,
    mode: MACHINE_MODE.ALIGN,
    isNativeMapInput: false,
    isPassThrough: false,
    canEditOverlay: true,
    arePinsVisible: true,
    ownsPointerHitTesting: true,
  });

  host.selectMode(MACHINE_MODE.TRACE);
  currentState = state(host);
  assert.equal(currentState.session.mode, MACHINE_MODE.TRACE);
  assert.equal(selectOverlayPolicy(currentState).isPassThrough, true);
});

test("machine rejects panel intents that are invalid for the current state", () => {
  let host = createHost();
  let before = state(host);

  let result = host.requestPanelIntent(MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM);
  assert.deepEqual(result.state, before);
  assert.deepEqual(result.effects, []);

  host = createLoadedHost();
  addPin(host);
  host.selectMode(MACHINE_MODE.TRACE);
  before = state(host);
  result = host.requestPanelIntent(MACHINE_PANEL_INTENT.CLEAR_PINS_CONFIRM);

  assert.deepEqual(result.state, before);
  assert.deepEqual(result.effects, []);
});
