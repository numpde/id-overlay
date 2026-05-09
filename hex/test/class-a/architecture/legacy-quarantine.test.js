// The legacy tree is reference material only. These tests prevent the clean
// implementation from quietly depending on quarantined source or tests.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  HEX_ROOT,
  extractImportSpecifiers,
  hexPath,
  isInsidePath,
  listJavaScriptFiles,
  readSource,
  relativeToRepo,
  resolveRelativeImport,
  repoPath,
} from "./source-files.js";

test("legacy implementation remains quarantined outside the hex tree", () => {
  assert.equal(fs.existsSync(repoPath("legacy/src")), true);
  assert.equal(fs.existsSync(repoPath("legacy/test")), true);
  assert.equal(fs.existsSync(hexPath("legacy")), false);
});

test("hex JavaScript files do not import legacy code", () => {
  const violations = [];
  for (const filePath of listJavaScriptFiles(HEX_ROOT, { includeTests: true })) {
    for (const specifier of extractImportSpecifiers(readSource(filePath))) {
      const targetPath = resolveRelativeImport(filePath, specifier);
      if (specifier.includes("legacy") || (
        targetPath && isInsidePath(targetPath, repoPath("legacy"))
      )) {
        violations.push(`${relativeToRepo(filePath)} imports ${specifier}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});
