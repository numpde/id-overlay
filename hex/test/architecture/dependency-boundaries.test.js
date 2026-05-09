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

function getLayer(filePath) {
  for (const [layerName, directoryPath] of Object.entries(LAYERS)) {
    if (isInsidePath(filePath, directoryPath)) {
      return layerName;
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

function isSameAdapter(sourcePath, targetPath) {
  const sourceAdapter = adapterName(sourcePath);
  return sourceAdapter && sourceAdapter === adapterName(targetPath);
}

function adapterName(filePath) {
  const relativePath = path.relative(LAYERS.adapters, filePath);
  return relativePath.startsWith("..") ? null : relativePath.split(path.sep)[0];
}
