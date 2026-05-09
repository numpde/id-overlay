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

const TEST_AREAS = {
  architecture: hexPath("test/architecture"),
  domain: hexPath("test/domain"),
  application: hexPath("test/application"),
  adapters: hexPath("test/adapters"),
  integration: hexPath("test/integration"),
};

const PURE_CORE_TEST_EXTERNAL_IMPORTS = new Set([
  "node:assert/strict",
  "node:test",
]);

test("hex source directories exist as explicit architecture rings", () => {
  const missing = Object.entries(LAYERS)
    .filter(([, directoryPath]) => (
      !isInsidePath(directoryPath, HEX_ROOT) || !fs.existsSync(directoryPath)
    ))
    .map(([layerName]) => layerName);

  assert.deepEqual(missing, []);
});

test("hex test directories make the intended test boundary explicit", () => {
  const missing = Object.entries(TEST_AREAS)
    .filter(([, directoryPath]) => (
      !isInsidePath(directoryPath, hexPath("test")) || !fs.existsSync(directoryPath)
    ))
    .map(([areaName]) => areaName);

  assert.deepEqual(missing, []);
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

// Test code can leak architecture just as easily as production code. A domain
// or application test that imports an outward ring or another test area has
// already encoded the wrong shape, even if production code still looks clean.
test("domain and application tests do not import outward code", () => {
  const violations = [];
  for (const filePath of [
    ...listJavaScriptFiles(TEST_AREAS.domain, { includeTests: true }),
    ...listJavaScriptFiles(TEST_AREAS.application, { includeTests: true }),
  ]) {
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
  for (const [areaName, directoryPath] of Object.entries(TEST_AREAS)) {
    if (isInsidePath(filePath, directoryPath)) {
      return areaName;
    }
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
  if (testArea === "domain") {
    return targetLayer === "domain";
  }
  if (testArea === "application") {
    return ["domain", "ports", "application"].includes(targetLayer);
  }
  return true;
}

function isSameAdapter(sourcePath, targetPath) {
  const sourceAdapter = adapterName(sourcePath);
  return sourceAdapter && sourceAdapter === adapterName(targetPath);
}

function adapterName(filePath) {
  const relativePath = path.relative(LAYERS.adapters, filePath);
  return relativePath.startsWith("..") ? null : relativePath.split(path.sep)[0];
}
