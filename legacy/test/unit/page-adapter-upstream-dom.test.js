import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  findEmbeddedIdFrame,
  findReferenceTile,
  findViewportElement,
  isOverlayOwnedElement,
} from "../../src/content/page-adapter/upstream-dom.js";

test("upstream DOM adapter finds the first visible known map viewport", () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div class="main-map"></div><div id="map"></div></body></html>',
  );
  const mainMap = dom.window.document.querySelector(".main-map");
  const fallbackMap = dom.window.document.getElementById("map");
  setRect(mainMap, { width: 0, height: 0 });
  setRect(fallbackMap, { width: 800, height: 600 });

  try {
    assert.equal(findViewportElement(dom.window.document), fallbackMap);
  } finally {
    dom.window.close();
  }
});

test("upstream DOM adapter detects extension-owned elements by ancestor marker", () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div data-id-overlay-owned="true"><button id="button"></button></div><div id="map"></div></body></html>',
  );

  try {
    assert.equal(isOverlayOwnedElement(dom.window.document.getElementById("button")), true);
    assert.equal(isOverlayOwnedElement(dom.window.document.getElementById("map")), false);
    assert.equal(isOverlayOwnedElement(null), false);
  } finally {
    dom.window.close();
  }
});

test("upstream DOM adapter prefers the center tile as the map-view reference tile", () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><img id="large" class="tile"><img id="center" class="tile tile-center"></body></html>',
  );
  const largeTile = dom.window.document.getElementById("large");
  const centerTile = dom.window.document.getElementById("center");
  setRect(largeTile, { width: 512, height: 512 });
  setRect(centerTile, { width: 1, height: 1 });

  try {
    assert.equal(findReferenceTile(dom.window.document), centerTile);
  } finally {
    dom.window.close();
  }
});

test("upstream DOM adapter chooses the largest visible tile when there is no center tile", () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><img id="small" class="tile"><img id="large" class="tile"></body></html>',
  );
  const smallTile = dom.window.document.getElementById("small");
  const largeTile = dom.window.document.getElementById("large");
  setRect(smallTile, { width: 10, height: 10 });
  setRect(largeTile, { width: 512, height: 512 });

  try {
    assert.equal(findReferenceTile(dom.window.document), largeTile);
  } finally {
    dom.window.close();
  }
});

test("upstream DOM adapter accepts only same-origin OpenStreetMap iD embed frames", () => {
  const dom = new JSDOM('<!doctype html><html><body><iframe id="id-embed"></iframe></body></html>');
  const frame = dom.window.document.getElementById("id-embed");
  const contentDocument = new JSDOM("<!doctype html><html><body></body></html>").window.document;
  Object.defineProperty(frame, "contentWindow", {
    configurable: true,
    value: {
      location: {
        origin: "https://www.openstreetmap.org",
        pathname: "/id",
      },
    },
  });
  Object.defineProperty(frame, "contentDocument", {
    configurable: true,
    value: contentDocument,
  });

  try {
    assert.equal(findEmbeddedIdFrame(dom.window.document), frame);

    frame.contentWindow.location.pathname = "/edit";

    assert.equal(findEmbeddedIdFrame(dom.window.document), null);
  } finally {
    dom.window.close();
    contentDocument.defaultView?.close();
  }
});

function setRect(element, { left = 0, top = 0, width, height }) {
  element.getBoundingClientRect = () => ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  });
}
