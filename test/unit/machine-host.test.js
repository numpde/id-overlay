import test from "node:test";
import assert from "node:assert/strict";

import {
  MACHINE_MODE,
  MACHINE_PANEL_INTENT,
} from "../../src/core/machine/events.js";
import { createMachineHost } from "../../src/core/machine/host.js";
import {
  selectPanelStatusText,
} from "../../src/core/machine/selectors.js";
import {
  createIdlePanel,
  createInitialMachineState,
} from "../../src/core/machine/state.js";
import { normalizeSessionImage } from "../../src/core/session.js";

// TODO(smell): Host tests still use explicit event-shaped host verbs for setup.
// Collapse those into product-level user/fact ingress once the public
// interpreter replaces raw machine events.
const IMAGE = Object.freeze({
  src: "data:image/png;base64,abc",
  width: 800,
  height: 400,
});
const NORMALIZED_IMAGE = normalizeSessionImage(IMAGE);
const CLIPBOARD_MISSING_IMAGE_NOTICE = "clipboard-missing-image";
const PASTE_CANCELLED_NOTICE = "paste-cancelled";

const PLACEMENT = Object.freeze({
  type: "similarity",
  a: 1,
  b: 0,
  tx: 10,
  ty: 20,
  scale: 1,
  rotationRad: 0,
});

test("machine host hydrates from persisted durable session only", () => {
  const host = createMachineHost({
    persistedSession: {
      mode: MACHINE_MODE.ALIGN,
      opacity: 0.75,
      image: IMAGE,
      placement: PLACEMENT,
      panel: {
        intent: MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM,
        requestId: 99,
      },
      history: {
        past: [{ kind: "load-image" }],
      },
    },
  });

  assert.equal(host.getState().session.mode, MACHINE_MODE.ALIGN);
  assert.equal(host.getState().session.opacity, 0.75);
  assert.deepEqual(host.getState().session.image, NORMALIZED_IMAGE);
  assert.deepEqual(host.getState().panel, createIdlePanel());
  assert.deepEqual(host.getState().history, createInitialMachineState().history);
});

test("machine host persists durable session after state changes only", () => {
  const saves = [];
  const host = createMachineHost({
    savePersistedSession: (session) => saves.push(session),
  });

  assert.deepEqual(saves, []);

  host.selectMode(MACHINE_MODE.TRACE);
  assert.deepEqual(saves, []);
  host.requestPanelIntent(MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM);
  assert.deepEqual(saves, []);

  host.loadImage({
    image: IMAGE,
    placement: PLACEMENT,
  });

  assert.equal(saves.length, 1);
  assert.deepEqual(saves[0], {
    mode: MACHINE_MODE.ALIGN,
    opacity: 0.6,
    image: NORMALIZED_IMAGE,
    placement: PLACEMENT,
    registration: {
      pins: [],
      solvedTransform: null,
      dirty: false,
    },
  });
});

test("machine host routes paste effects back through typed effect results", async () => {
  const host = createMachineHost({
    readPasteImage: () => IMAGE,
  });

  host.requestPanelIntent(MACHINE_PANEL_INTENT.PASTE_ARMED);
  await Promise.resolve();

  assert.deepEqual(host.getState().session.image, NORMALIZED_IMAGE);
  assert.deepEqual(host.getState().panel, createIdlePanel());
});

test("machine host ignores stale missing-paste results", async () => {
  const unresolvedSecondPaste = new Promise(() => {});
  const host = createMachineHost({
    readPasteImage: ({ requestId }) => requestId === 1 ? null : unresolvedSecondPaste,
  });

  host.requestPanelIntent(MACHINE_PANEL_INTENT.PASTE_ARMED);
  const requestId = host.getState().panel.requestId;
  host.requestPanelIntent(MACHINE_PANEL_INTENT.PASTE_ARMED);
  host.cancelPanelIntent({
    requestId,
  });
  await Promise.resolve();

  assert.equal(host.getState().panel.intent, MACHINE_PANEL_INTENT.PASTE_ARMED);
  assert.equal(host.getState().panel.requestId, 2);
});

test("machine host interprets primary panel activation from canonical state", () => {
  const host = createMachineHost();

  host.activatePanelPrimary();
  assert.equal(host.getState().panel.intent, MACHINE_PANEL_INTENT.PASTE_ARMED);

  host.activatePanelPrimary();
  assert.deepEqual(host.getState().panel, createIdlePanel());
  assert.equal(selectPanelStatusText(host.getState()), "Paste cancelled.");

  host.loadImage({
    image: IMAGE,
    placement: PLACEMENT,
  });
  host.togglePin({
    imagePx: { x: 10, y: 20 },
    mapLatLon: { lat: 1, lon: 2 },
  });

  host.activatePanelPrimary();
  assert.equal(host.getState().panel.intent, MACHINE_PANEL_INTENT.CLEAR_PINS_CONFIRM);

  host.activatePanelPrimary();
  assert.equal(host.getState().session.registration.pins.length, 0);
  assert.deepEqual(host.getState().panel, createIdlePanel());

  host.activatePanelPrimary();
  assert.equal(host.getState().panel.intent, MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM);

  host.activatePanelPrimary();
  assert.equal(host.getState().session.image, null);
  assert.deepEqual(host.getState().panel, createIdlePanel());
});

test("machine host exposes semantic panel mode opacity and history activations", () => {
  const host = createMachineHost();
  host.loadImage({
    image: IMAGE,
    placement: PLACEMENT,
  });

  host.activatePanelMode({ checked: true });
  assert.equal(host.getState().session.mode, MACHINE_MODE.TRACE);

  host.activatePanelModeStep({ deltaY: -100 });
  assert.equal(host.getState().session.mode, MACHINE_MODE.ALIGN);

  host.changePanelOpacity("0.45");
  assert.equal(host.getState().session.opacity, 0.45);

  host.changePanelOpacityByWheel({ value: "0.45", deltaY: -100 });
  assert.equal(host.getState().session.opacity, 0.55);

  host.activateUndo();
  assert.equal(host.getState().session.image, null);

  host.activateRedo();
  assert.deepEqual(host.getState().session.image, NORMALIZED_IMAGE);
});

test("machine host starts, replaces, expires, and cancels request-bound panel timers", () => {
  const timers = createTimerHarness();
  const host = createMachineHost({
    setPanelTimeout: timers.set,
    clearPanelTimeout: timers.clear,
  });

  host.loadImage({
    image: IMAGE,
    placement: PLACEMENT,
  });
  host.togglePin({
    imagePx: { x: 10, y: 20 },
    mapLatLon: { lat: 1, lon: 2 },
  });
  host.requestPanelIntent(MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM);
  assert.equal(timers.pendingCount(), 1);

  host.requestPanelIntent(MACHINE_PANEL_INTENT.CLEAR_PINS_CONFIRM);
  assert.equal(timers.pendingCount(), 1);
  assert.equal(timers.cleared.length, 1);

  timers.fireLatest();
  assert.deepEqual(host.getState().panel, createIdlePanel());
  assert.equal(timers.pendingCount(), 0);

  host.requestPanelIntent(MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM);
  host.cancelPanelIntent({
    requestId: host.getState().panel.requestId,
  });

  assert.equal(timers.pendingCount(), 0);
});

test("machine host starts, replaces, expires, and cancels request-bound status timers", () => {
  const timers = createTimerHarness();
  const host = createMachineHost({
    setStatusTimeout: timers.set,
    clearStatusTimeout: timers.clear,
  });

  host.reportStatusNotice({
    noticeKind: CLIPBOARD_MISSING_IMAGE_NOTICE,
  });
  assert.equal(timers.pendingCount(), 1);
  assert.equal(host.getState().status.notice.requestId, 1);

  host.reportStatusNotice({
    noticeKind: PASTE_CANCELLED_NOTICE,
  });
  assert.equal(timers.pendingCount(), 1);
  assert.deepEqual(timers.cleared, [1]);
  assert.equal(host.getState().status.notice.requestId, 2);

  timers.fireLatest();
  assert.equal(host.getState().status.notice, null);
  assert.equal(timers.pendingCount(), 0);

  host.reportStatusNotice({
    noticeKind: PASTE_CANCELLED_NOTICE,
  });
  timers.fireLatest();

  assert.equal(host.getState().status.notice, null);
  assert.equal(timers.pendingCount(), 0);
});

test("machine host destroy unsubscribes persistence and cancels outstanding timers", () => {
  const saves = [];
  const observedStates = [];
  const timers = createTimerHarness();
  const statusTimers = createTimerHarness();
  const host = createMachineHost({
    savePersistedSession: (session) => saves.push(session),
    setPanelTimeout: timers.set,
    clearPanelTimeout: timers.clear,
    setStatusTimeout: statusTimers.set,
    clearStatusTimeout: statusTimers.clear,
  });
  host.loadImage({
    image: IMAGE,
    placement: PLACEMENT,
  });
  saves.length = 0;

  const unsubscribe = host.subscribe((state) => observedStates.push(state), {
    emitCurrent: false,
  });

  host.requestPanelIntent(MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM);
  host.reportStatusNotice({
    noticeKind: PASTE_CANCELLED_NOTICE,
  });
  assert.equal(timers.pendingCount(), 1);
  assert.equal(statusTimers.pendingCount(), 1);

  host.destroy();
  assert.equal(timers.pendingCount(), 0);
  assert.equal(statusTimers.pendingCount(), 0);

  const before = host.getState();
  const result = host.loadImage({
    image: IMAGE,
    placement: PLACEMENT,
  });

  assert.equal(result.state, before);
  assert.equal(host.getState(), before);
  assert.deepEqual(saves, []);
  assert.equal(observedStates.length, 2);
  assert.doesNotThrow(() => unsubscribe());
});

function createTimerHarness() {
  let nextId = 1;
  const pending = new Map();
  const cleared = [];

  return {
    cleared,
    set(callback) {
      const id = nextId;
      nextId += 1;
      pending.set(id, callback);
      return id;
    },
    clear(id) {
      cleared.push(id);
      pending.delete(id);
    },
    fireLatest() {
      const id = Math.max(...pending.keys());
      const callback = pending.get(id);
      pending.delete(id);
      callback?.();
    },
    pendingCount() {
      return pending.size;
    },
  };
}
