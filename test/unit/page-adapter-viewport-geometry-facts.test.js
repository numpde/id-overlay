import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createElementViewportGeometry,
  createFallbackViewportGeometry,
} from "../../src/content/page-adapter/viewport-geometry-facts.js";
import { PAGE_VIEWPORT_PROVENANCE_KIND } from "../../src/content/page-adapter/page-snapshot.js";

test("element viewport geometry exposes screen and local viewport facts without a frame", () => {
  const viewportElement = createElementWithRect({
    left: 120,
    top: 80,
    width: 900,
    height: 600,
  });

  assert.deepEqual(createElementViewportGeometry({ viewportElement }), {
    viewportElement,
    mountElement: viewportElement,
    viewportRect: {
      left: 120,
      top: 80,
      width: 900,
      height: 600,
    },
    localViewportRect: {
      left: 0,
      top: 0,
      width: 900,
      height: 600,
    },
    viewportProvenance: {
      kind: PAGE_VIEWPORT_PROVENANCE_KIND.ELEMENT,
    },
  });
});

test("element viewport geometry translates iframe-local viewport rects into screen space", () => {
  const viewportElement = createElementWithRect({
    left: 20,
    top: 30,
    width: 700,
    height: 500,
  });
  const frameElement = createElementWithRect({
    left: 300,
    top: 40,
    width: 900,
    height: 600,
  });

  assert.deepEqual(createElementViewportGeometry({ viewportElement, frameElement }), {
    viewportElement,
    mountElement: viewportElement,
    viewportRect: {
      left: 320,
      top: 70,
      width: 700,
      height: 500,
    },
    localViewportRect: {
      left: 0,
      top: 0,
      width: 700,
      height: 500,
    },
    viewportProvenance: {
      kind: PAGE_VIEWPORT_PROVENANCE_KIND.ELEMENT,
    },
  });
});

test("fallback viewport geometry uses window viewport facts when there is no frame", () => {
  const context = createContext({
    viewportDocument: createDocument(),
    mapWindow: createWindowLike({ innerWidth: 900, innerHeight: 600 }),
  });

  assert.deepEqual(createFallbackViewportGeometry({
    context,
    hashTarget: createWindowLike({ innerWidth: 1440, innerHeight: 900 }),
  }), {
    viewportElement: null,
    mountElement: context.viewportDocument.body,
    viewportRect: {
      left: 0,
      top: 0,
      width: 1440,
      height: 900,
    },
    localViewportRect: {
      left: 0,
      top: 0,
      width: 900,
      height: 600,
    },
    viewportProvenance: {
      kind: PAGE_VIEWPORT_PROVENANCE_KIND.FALLBACK,
    },
  });
});

test("fallback viewport geometry uses the iframe rect for screen space when framed", () => {
  const frameElement = createElementWithRect({
    left: 300,
    top: 40,
    width: 900,
    height: 600,
  });
  const context = createContext({
    frameElement,
    viewportDocument: createDocument(),
    mapWindow: createWindowLike({ innerWidth: 700, innerHeight: 500 }),
  });

  assert.deepEqual(createFallbackViewportGeometry({
    context,
    hashTarget: createWindowLike({ innerWidth: 1440, innerHeight: 900 }),
  }), {
    viewportElement: null,
    mountElement: context.viewportDocument.body,
    viewportRect: {
      left: 300,
      top: 40,
      width: 900,
      height: 600,
    },
    localViewportRect: {
      left: 0,
      top: 0,
      width: 700,
      height: 500,
    },
    viewportProvenance: {
      kind: PAGE_VIEWPORT_PROVENANCE_KIND.FALLBACK,
    },
  });
});

function createContext({
  frameElement = null,
  viewportDocument,
  mapWindow,
}) {
  return {
    frameElement,
    viewportDocument,
    mapWindow,
  };
}

function createDocument() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  return dom.window.document;
}

function createWindowLike({ innerWidth, innerHeight }) {
  return {
    innerWidth,
    innerHeight,
  };
}

function createElementWithRect(rect) {
  return {
    getBoundingClientRect() {
      return rect;
    },
  };
}
