import test from "node:test";
import assert from "node:assert/strict";

import {
  FORWARDED_MAP_GESTURE_EVENT_FLAG,
  dispatchForwardedMapPointerPhase,
  dispatchForwardedMapWheel,
  isForwardedMapGestureEvent,
} from "../../src/content/page-adapter/forwarded-map-events.js";

test("forwarded map pointer phases dispatch pointer and mouse events with canonical identity", () => {
  const target = createDispatchTarget();
  const context = createForwardedEventContext({
    PointerEvent: FakeEvent,
    MouseEvent: FakeEvent,
  });

  dispatchForwardedMapPointerPhase({
    context,
    target,
    type: "down",
    clientPoint: { x: 12, y: 34 },
  });

  assert.deepEqual(target.events.map((event) => event.type), ["pointerdown", "mousedown"]);
  for (const event of target.events) {
    assert.equal(isForwardedMapGestureEvent(event), true);
    assert.equal(Object.keys(event).includes(FORWARDED_MAP_GESTURE_EVENT_FLAG), false);
    assert.equal(event.clientX, 12);
    assert.equal(event.clientY, 34);
    assert.equal(event.buttons, 1);
    assert.equal(event.view, context.mapWindow);
  }
  assert.equal(target.events[0].pointerId, 1);
  assert.equal(target.events[0].pointerType, "mouse");
  assert.equal(target.events[0].isPrimary, true);
});

test("forwarded map pointer phases fall back to mouse events without PointerEvent support", () => {
  const target = createDispatchTarget();
  const context = createForwardedEventContext({
    MouseEvent: FakeEvent,
  });

  dispatchForwardedMapPointerPhase({
    context,
    target,
    type: "up",
    clientPoint: { x: 56, y: 78 },
  });

  assert.deepEqual(target.events.map((event) => event.type), ["mouseup"]);
  assert.equal(isForwardedMapGestureEvent(target.events[0]), true);
  assert.equal(target.events[0].buttons, 0);
});

test("forwarded map wheel dispatches one flagged wheel event with deltas", () => {
  const target = createDispatchTarget();
  const context = createForwardedEventContext({
    WheelEvent: FakeEvent,
  });

  dispatchForwardedMapWheel({
    context,
    target,
    clientPoint: { x: 90, y: 91 },
    deltaX: 1,
    deltaY: -2,
    deltaMode: 3,
  });

  assert.equal(target.events.length, 1);
  assert.equal(target.events[0].type, "wheel");
  assert.equal(isForwardedMapGestureEvent(target.events[0]), true);
  assert.equal(target.events[0].deltaX, 1);
  assert.equal(target.events[0].deltaY, -2);
  assert.equal(target.events[0].deltaMode, 3);
  assert.equal(target.events[0].clientX, 90);
  assert.equal(target.events[0].clientY, 91);
});

function createForwardedEventContext(eventConstructors) {
  return {
    mapWindow: eventConstructors,
  };
}

function createDispatchTarget() {
  return {
    events: [],
    dispatchEvent(event) {
      this.events.push(event);
    },
  };
}

class FakeEvent {
  constructor(type, init) {
    this.type = type;
    Object.assign(this, init);
  }
}
