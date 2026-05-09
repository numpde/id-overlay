import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  createViewportElementResolver,
  resolveSurfaceMotionFact,
} from "../../src/content/page-adapter/upstream-viewport.js";

test("upstream viewport resolver reuses a connected same-document viewport", () => {
  const resolver = createViewportElementResolver();
  const dom = createViewportDom();
  const viewport = dom.window.document.querySelector(".main-map");

  try {
    assert.equal(resolver.resolveViewportElement(createContext(dom.window.document)), viewport);
    viewport.className = "";

    assert.equal(resolver.resolveViewportElement(createContext(dom.window.document)), viewport);
  } finally {
    dom.window.close();
  }
});

test("upstream viewport resolver retargets when the viewport document changes", () => {
  const resolver = createViewportElementResolver();
  const firstDom = createViewportDom();
  const secondDom = createViewportDom();
  const firstViewport = firstDom.window.document.querySelector(".main-map");
  const secondViewport = secondDom.window.document.querySelector(".main-map");

  try {
    assert.equal(resolver.resolveViewportElement(createContext(firstDom.window.document)), firstViewport);
    assert.equal(resolver.resolveViewportElement(createContext(secondDom.window.document)), secondViewport);
  } finally {
    firstDom.window.close();
    secondDom.window.close();
  }
});

test("upstream viewport resolver refresh invalidates hidden or disconnected cached viewports", () => {
  const hiddenDom = createViewportDom();
  const disconnectedDom = createViewportDom();
  const hiddenResolver = createViewportElementResolver();
  const disconnectedResolver = createViewportElementResolver();
  const hiddenViewport = hiddenDom.window.document.querySelector(".main-map");
  const disconnectedViewport = disconnectedDom.window.document.querySelector(".main-map");

  try {
    assert.equal(hiddenResolver.resolveViewportElement(createContext(hiddenDom.window.document)), hiddenViewport);
    setRect(hiddenViewport, { width: 0, height: 0 });
    hiddenResolver.refreshViewportElement();
    hiddenViewport.className = "";

    assert.equal(hiddenResolver.resolveViewportElement(createContext(hiddenDom.window.document)), null);

    assert.equal(
      disconnectedResolver.resolveViewportElement(createContext(disconnectedDom.window.document)),
      disconnectedViewport,
    );
    disconnectedViewport.remove();
    disconnectedResolver.refreshViewportElement();

    assert.equal(disconnectedResolver.resolveViewportElement(createContext(disconnectedDom.window.document)), null);
  } finally {
    hiddenDom.window.close();
    disconnectedDom.window.close();
  }
});

test("upstream viewport resolver clear and destroy drop cached viewport identity", () => {
  const clearResolver = createViewportElementResolver();
  const destroyResolver = createViewportElementResolver();
  const clearDom = createViewportDom();
  const destroyDom = createViewportDom();
  const clearViewport = clearDom.window.document.querySelector(".main-map");
  const destroyViewport = destroyDom.window.document.querySelector(".main-map");

  try {
    assert.equal(clearResolver.resolveViewportElement(createContext(clearDom.window.document)), clearViewport);
    clearResolver.clearViewportElement();
    clearViewport.className = "";

    assert.equal(clearResolver.resolveViewportElement(createContext(clearDom.window.document)), null);

    assert.equal(destroyResolver.resolveViewportElement(createContext(destroyDom.window.document)), destroyViewport);
    destroyResolver.destroy();
    destroyViewport.className = "";

    assert.equal(destroyResolver.resolveViewportElement(createContext(destroyDom.window.document)), null);
  } finally {
    clearDom.window.close();
    destroyDom.window.close();
  }
});

test("upstream viewport surface motion defaults to inert motion when the map surface is absent", () => {
  const document = createDocument();

  assert.deepEqual(resolveSurfaceMotionFact(document), {
    transformCss: "none",
    transformOriginCss: "0px 0px",
  });
});

test("upstream viewport surface motion reads the active map surface CSS transform", () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div class="supersurface"></div></body></html>',
    { pretendToBeVisual: true },
  );
  const surface = dom.window.document.querySelector(".supersurface");
  surface.style.transform = "matrix(1, 0, 0, 1, 18, -12)";
  surface.style.transformOrigin = "0px 0px";

  try {
    assert.deepEqual(resolveSurfaceMotionFact(dom.window.document), {
      transformCss: "matrix(1, 0, 0, 1, 18, -12)",
      transformOriginCss: "0px 0px",
    });
  } finally {
    dom.window.close();
  }
});

function createContext(viewportDocument) {
  return {
    viewportDocument,
  };
}

function createDocument() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  return dom.window.document;
}

function createViewportDom() {
  const dom = new JSDOM('<!doctype html><html><body><div class="main-map"></div></body></html>');
  setRect(dom.window.document.querySelector(".main-map"), { width: 900, height: 600 });
  return dom;
}

function setRect(element, { width, height }) {
  element.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width,
    height,
    right: width,
    bottom: height,
  });
}
