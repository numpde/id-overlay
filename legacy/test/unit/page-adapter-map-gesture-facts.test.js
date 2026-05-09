import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveMapPanContinuationGestureFacts,
  resolveMapPanGestureFacts,
  resolveMapZoomGestureFacts,
} from "../../src/content/page-adapter/map-gesture-facts.js";

test("map pan gesture facts resolve client point and pan target", () => {
  const viewport = createTarget("viewport");
  const context = createContext({
    viewportDocument: createDocument({ viewport }),
  });

  assert.deepEqual(resolveMapPanGestureFacts({
    context,
    screenPoint: { x: 12, y: 34 },
  }), {
    context,
    clientPoint: { x: 12, y: 34 },
    target: viewport,
  });
});

test("map zoom gesture facts resolve iframe-local point before hit-testing", () => {
  const zoomTarget = createTarget("zoom-target");
  const context = createContext({
    frameElement: createFrame({ left: 300, top: 40 }),
    viewportDocument: createDocument({
      elementsFromPoint(x, y) {
        assert.equal(x, 500);
        assert.equal(y, 200);
        return [zoomTarget];
      },
    }),
  });

  assert.deepEqual(resolveMapZoomGestureFacts({
    context,
    screenPoint: { x: 800, y: 240 },
  }), {
    context,
    clientPoint: { x: 500, y: 200 },
    target: zoomTarget,
  });
});

test("map pan continuation facts keep dispatching to the active map document", () => {
  const viewportDocument = createDocument();
  const context = createContext({
    frameElement: createFrame({ left: 300, top: 40 }),
    viewportDocument,
  });

  assert.deepEqual(resolveMapPanContinuationGestureFacts({
    context,
    screenPoint: { x: 820, y: 260 },
  }), {
    context,
    clientPoint: { x: 520, y: 220 },
    target: viewportDocument,
  });
});

test("map gesture facts return null when no target can be resolved", () => {
  const context = createContext({
    viewportDocument: createDocument({
      body: null,
      documentElement: null,
      elementsFromPoint: () => [],
      elementFromPoint: () => null,
    }),
  });

  assert.equal(resolveMapPanGestureFacts({
    context,
    screenPoint: { x: 1, y: 2 },
  }), null);
  assert.equal(resolveMapZoomGestureFacts({
    context,
    screenPoint: { x: 1, y: 2 },
  }), null);
});

function createContext({
  frameElement = null,
  viewportDocument = createDocument(),
} = {}) {
  return {
    mapWindow: {},
    viewportDocument,
    frameElement,
  };
}

function createDocument({
  viewport = null,
  body = createTarget("body"),
  documentElement = createTarget("documentElement"),
  elementsFromPoint = () => [],
  elementFromPoint = () => null,
} = {}) {
  return {
    body,
    documentElement,
    elementsFromPoint,
    elementFromPoint,
    querySelector() {
      return viewport;
    },
  };
}

function createFrame({ left, top }) {
  return {
    getBoundingClientRect() {
      return {
        left,
        top,
      };
    },
  };
}

function createTarget(id) {
  return {
    id,
    closest() {
      return null;
    },
    getBoundingClientRect() {
      return {
        width: 1,
        height: 1,
      };
    },
  };
}
