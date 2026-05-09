// These tests keep the product core independent from browser and extension
// concepts. Browser objects belong in adapters, not in domain/application/ports.
import test from "node:test";
import assert from "node:assert/strict";

import {
  hexPath,
  listJavaScriptFiles,
  readSource,
  relativeToRepo,
} from "./source-files.js";

const FORBIDDEN_BROWSER_VOCABULARY = [
  "window",
  "document",
  "navigator",
  "chrome",
  "browser",
  "Event",
  "PointerEvent",
  "KeyboardEvent",
  "WheelEvent",
  "MouseEvent",
  "Element",
  "HTMLElement",
  "Blob",
  "File",
  "Image",
  "FileReader",
  "HTMLCanvasElement",
  "CanvasRenderingContext2D",
  "createImageBitmap",
  "setTimeout",
  "clearTimeout",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "localStorage",
  "sessionStorage",
];

test("domain, application, and ports do not mention browser or platform objects", () => {
  const violations = [];
  for (const directoryPath of [
    hexPath("domain"),
    hexPath("application"),
    hexPath("ports"),
  ]) {
    for (const filePath of listJavaScriptFiles(directoryPath, { includeTests: true })) {
      const source = readSource(filePath);
      for (const word of FORBIDDEN_BROWSER_VOCABULARY) {
        if (new RegExp(`\\b${word}\\b`).test(source)) {
          violations.push(`${relativeToRepo(filePath)} mentions ${word}`);
        }
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("domain and application tests stay plain-data tests", () => {
  const violations = [];
  for (const directoryPath of [
    hexPath("test/domain"),
    hexPath("test/application"),
  ]) {
    for (const filePath of listJavaScriptFiles(directoryPath, { includeTests: true })) {
      const source = readSource(filePath);
      for (const word of FORBIDDEN_BROWSER_VOCABULARY) {
        if (new RegExp(`\\b${word}\\b`).test(source)) {
          violations.push(`${relativeToRepo(filePath)} mentions ${word}`);
        }
      }
      if (/\bjsdom\b/i.test(source)) {
        violations.push(`${relativeToRepo(filePath)} imports jsdom`);
      }
    }
  }

  assert.deepEqual(violations, []);
});
