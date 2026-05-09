// These tests make the hexagonal dependency direction executable. They should
// fail before review if a new module points outward or bypasses the intended
// composition boundary.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  HEX_ROOT,
  extractImportSpecifiers,
  hexPath,
  isInsidePath,
  listJavaScriptFiles,
  readSource,
  relativeToRepo,
  resolveRelativeImport,
} from "./source-files.js";

const LAYERS = {
  domain: hexPath("domain"),
  ports: hexPath("ports"),
  application: hexPath("application"),
  adapters: hexPath("adapters"),
  bootstrap: hexPath("bootstrap"),
};

const TEST_CLASS_NAMES = [
  "class-a",
  "class-b",
  "class-c",
];

const TEST_RING_NAMES = [
  "architecture",
  "domain",
  "application",
  "adapters",
  "integration",
];

const TEST_CLASSES = Object.fromEntries(
  TEST_CLASS_NAMES.map((className) => [className, hexPath("test", className)]),
);

const TEST_RINGS = new Set(TEST_RING_NAMES);

const TEST_AREAS = Object.fromEntries(
  TEST_CLASS_NAMES.flatMap((className) => (
    TEST_RING_NAMES.map((ringName) => [
      `${className}/${ringName}`,
      hexPath("test", className, ringName),
    ])
  )),
);

const PURE_CORE_TEST_EXTERNAL_IMPORTS = new Set([
  "node:assert/strict",
  "node:test",
]);

const PURE_CORE_TEST_CLASS_NAMES = new Set([
  "class-a",
  "class-b",
]);

const PURE_CORE_TEST_AREA_DIRECTORIES = Object.entries(TEST_AREAS)
  .filter(([testArea]) => (
    PURE_CORE_TEST_CLASS_NAMES.has(testClassOf(testArea))
      && ["domain", "application"].includes(testRingOf(testArea))
  ))
  .map(([, directoryPath]) => directoryPath);

test("hex source directories exist as explicit architecture rings", () => {
  const missing = Object.entries(LAYERS)
    .filter(([, directoryPath]) => (
      !isInsidePath(directoryPath, HEX_ROOT) || !fs.existsSync(directoryPath)
    ))
    .map(([layerName]) => layerName);

  assert.deepEqual(missing, []);
});

test("hex test authority classes are explicit", () => {
  const missing = Object.entries(TEST_CLASSES)
    .filter(([, directoryPath]) => (
      !isInsidePath(directoryPath, hexPath("test")) || !fs.existsSync(directoryPath)
    ))
    .map(([className]) => className);

  assert.deepEqual(missing, []);
});

test("hex tests declare authority class and test ring in their path", () => {
  const unclassified = listJavaScriptFiles(hexPath("test"), { includeTests: true })
    .filter((filePath) => !getTestArea(filePath))
    .map(relativeToRepo);

  assert.deepEqual(unclassified, []);
});

test("class-c quarantine does not leak into stronger test classes", () => {
  const violations = [];
  for (const filePath of [
    ...listJavaScriptFiles(TEST_CLASSES["class-a"], { includeTests: true }),
    ...listJavaScriptFiles(TEST_CLASSES["class-b"], { includeTests: true }),
  ]) {
    for (const specifier of extractImportSpecifiers(readSource(filePath))) {
      const targetPath = resolveRelativeImport(filePath, specifier);
      if (targetPath && isInsidePath(targetPath, TEST_CLASSES["class-c"])) {
        violations.push(`${relativeToRepo(filePath)} imports class-c: ${specifier}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("hex production imports point inward only", () => {
  const violations = [];
  for (const filePath of listJavaScriptFiles(HEX_ROOT)) {
    const sourceLayer = getLayer(filePath);
    if (!sourceLayer) {
      continue;
    }

    for (const specifier of extractImportSpecifiers(readSource(filePath))) {
      const targetPath = resolveRelativeImport(filePath, specifier);
      if (!targetPath) {
        if (isPureRing(sourceLayer)) {
          violations.push(`${relativeToRepo(filePath)} imports external module ${specifier}`);
        }
        continue;
      }

      const targetLayer = getLayer(targetPath);
      if (!targetLayer) {
        violations.push(`${relativeToRepo(filePath)} imports outside hex rings: ${specifier}`);
        continue;
      }
      if (!canImportLayer({ sourceLayer, targetLayer, sourcePath: filePath, targetPath })) {
        violations.push(
          `${relativeToRepo(filePath)} (${sourceLayer}) imports ${targetLayer}: ${specifier}`,
        );
      }
    }
  }

  assert.deepEqual(violations, []);
});

// Test code can leak architecture just as easily as production code. Class-a
// and class-b pure-core tests are design evidence; if they import outward, they
// have already encoded the wrong shape.
test("domain and application tests do not import outward code", () => {
  const violations = [];
  for (const directoryPath of PURE_CORE_TEST_AREA_DIRECTORIES) {
    for (const filePath of listJavaScriptFiles(directoryPath, { includeTests: true })) {
      const sourceTestArea = getTestArea(filePath);
      if (!sourceTestArea) {
        continue;
      }

      for (const specifier of extractImportSpecifiers(readSource(filePath))) {
        const targetPath = resolveRelativeImport(filePath, specifier);
        if (!targetPath) {
          if (!PURE_CORE_TEST_EXTERNAL_IMPORTS.has(specifier)) {
            violations.push(
              `${relativeToRepo(filePath)} (${sourceTestArea} test) imports external module ${specifier}`,
            );
          }
          continue;
        }

        const targetTestArea = getTestArea(targetPath);
        if (targetTestArea && targetTestArea !== sourceTestArea) {
          violations.push(
            `${relativeToRepo(filePath)} (${sourceTestArea} test) imports ${targetTestArea} test: ${specifier}`,
          );
          continue;
        }
        if (targetTestArea === sourceTestArea) {
          continue;
        }

        const targetLayer = getLayer(targetPath);
        if (!targetLayer) {
          violations.push(
            `${relativeToRepo(filePath)} (${sourceTestArea} test) imports outside allowed boundaries: ${specifier}`,
          );
          continue;
        }
        if (!canTestAreaImportLayer(sourceTestArea, targetLayer)) {
          violations.push(
            `${relativeToRepo(filePath)} (${sourceTestArea} test) imports ${targetLayer}: ${specifier}`,
          );
        }
      }
    }
  }

  assert.deepEqual(violations, []);
});

function getLayer(filePath) {
  for (const [layerName, directoryPath] of Object.entries(LAYERS)) {
    if (isInsidePath(filePath, directoryPath)) {
      return layerName;
    }
  }
  return null;
}

function getTestArea(filePath) {
  const [testClass, testRing] = path.relative(hexPath("test"), filePath).split(path.sep);
  if (TEST_CLASSES[testClass] && TEST_RINGS.has(testRing)) {
    return `${testClass}/${testRing}`;
  }
  return null;
}

function isPureRing(layerName) {
  return ["domain", "ports", "application"].includes(layerName);
}

function canImportLayer({ sourceLayer, targetLayer, sourcePath, targetPath }) {
  if (sourceLayer === "domain") {
    return targetLayer === "domain";
  }
  if (sourceLayer === "ports") {
    return ["domain", "ports"].includes(targetLayer);
  }
  if (sourceLayer === "application") {
    return ["domain", "ports", "application"].includes(targetLayer);
  }
  if (sourceLayer === "adapters") {
    return ["domain", "ports", "application"].includes(targetLayer)
      || isSameAdapter(sourcePath, targetPath);
  }
  if (sourceLayer === "bootstrap") {
    return true;
  }
  return false;
}

function canTestAreaImportLayer(testArea, targetLayer) {
  const testRing = testRingOf(testArea);
  if (testRing === "domain") {
    return targetLayer === "domain";
  }
  if (testRing === "application") {
    return ["domain", "ports", "application"].includes(targetLayer);
  }
  return true;
}

function testRingOf(testArea) {
  return testArea.split("/")[1] ?? "";
}

function testClassOf(testArea) {
  return testArea.split("/")[0] ?? "";
}

function isSameAdapter(sourcePath, targetPath) {
  const sourceAdapter = adapterName(sourcePath);
  return sourceAdapter && sourceAdapter === adapterName(targetPath);
}

function adapterName(filePath) {
  const relativePath = path.relative(LAYERS.adapters, filePath);
  return relativePath.startsWith("..") ? null : relativePath.split(path.sep)[0];
}
