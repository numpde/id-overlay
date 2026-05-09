// The legacy tree is reference material only. These tests prevent the clean
// implementation from quietly depending on quarantined source or tests.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  HEX_ROOT,
  hexPath,
  listTextFiles,
  readSource,
  relativeToRepo,
  repoPath,
} from "./source-files.js";

test("legacy implementation remains quarantined outside the hex tree", () => {
  assert.equal(fs.existsSync(repoPath("legacy/src")), true);
  assert.equal(fs.existsSync(repoPath("legacy/test")), true);
  assert.equal(fs.existsSync(hexPath("legacy")), false);
});

test("hex production files do not import or reference legacy code", () => {
  const violations = [];
  for (const filePath of listTextFiles(HEX_ROOT)) {
    const source = readSource(filePath);
    if (/\blegacy(?:\/|\\)|(?:\.\.\/)+legacy\b/.test(source)) {
      violations.push(relativeToRepo(filePath));
    }
  }

  assert.deepEqual(violations, []);
});
