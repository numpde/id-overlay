import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  resolveMapPanTarget,
  resolveMapZoomTarget,
} from "../../src/content/page-adapter/map-gesture-targets.js";

test("map gesture targets use the visible viewport as the pan target", () => {
  const dom = new JSDOM('<!doctype html><html><body><div class="main-map"></div></body></html>');
  const viewport = dom.window.document.querySelector(".main-map");
  setRect(viewport, { width: 900, height: 600 });

  try {
    assert.equal(resolveMapPanTarget(createContext(dom.window.document)), viewport);
  } finally {
    dom.window.close();
  }
});

test("map gesture targets fall back to body or document element for pan target", () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");

  try {
    assert.equal(resolveMapPanTarget(createContext(dom.window.document)), dom.window.document.body);

    dom.window.document.body.remove();

    assert.equal(resolveMapPanTarget(createContext(dom.window.document)), dom.window.document.documentElement);
  } finally {
    dom.window.close();
  }
});

test("map gesture targets choose the first non-overlay element under zoom point", () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div data-id-overlay-owned="true"></div><canvas id="map"></canvas></body></html>',
  );
  const overlayElement = dom.window.document.querySelector("[data-id-overlay-owned]");
  const mapElement = dom.window.document.getElementById("map");
  dom.window.document.elementsFromPoint = (x, y) => {
    assert.equal(x, 12);
    assert.equal(y, 34);
    return [overlayElement, mapElement];
  };

  try {
    assert.equal(resolveMapZoomTarget(createContext(dom.window.document), { x: 12, y: 34 }), mapElement);
  } finally {
    dom.window.close();
  }
});

test("map gesture targets use elementFromPoint when elementsFromPoint is unavailable", () => {
  const dom = new JSDOM('<!doctype html><html><body><canvas id="map"></canvas></body></html>');
  const mapElement = dom.window.document.getElementById("map");
  dom.window.document.elementFromPoint = (x, y) => {
    assert.equal(x, 56);
    assert.equal(y, 78);
    return mapElement;
  };

  try {
    assert.equal(resolveMapZoomTarget(createContext(dom.window.document), { x: 56, y: 78 }), mapElement);
  } finally {
    dom.window.close();
  }
});

test("map gesture targets fall back to viewport or body for zoom target", () => {
  const dom = new JSDOM('<!doctype html><html><body><div class="main-map"></div></body></html>');
  const viewport = dom.window.document.querySelector(".main-map");
  setRect(viewport, { width: 800, height: 500 });
  dom.window.document.elementsFromPoint = () => [];
  dom.window.document.elementFromPoint = () => null;

  try {
    assert.equal(resolveMapZoomTarget(createContext(dom.window.document), { x: 1, y: 2 }), viewport);

    setRect(viewport, { width: 0, height: 0 });

    assert.equal(resolveMapZoomTarget(createContext(dom.window.document), { x: 1, y: 2 }), dom.window.document.body);
  } finally {
    dom.window.close();
  }
});

function createContext(viewportDocument) {
  return { viewportDocument };
}

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
