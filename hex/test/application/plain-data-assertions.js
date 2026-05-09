import assert from "node:assert/strict";

// Test-local assertion for the application boundary. Keeping this outside
// production code prevents a helper from becoming architecture before the
// implementation actually needs one.
export function assertPlainData(value) {
  assertJsonShape(value);
}

function assertJsonShape(value) {
  if (value === null) {
    return;
  }
  if (Array.isArray(value)) {
    for (const nestedValue of value) {
      assertJsonShape(nestedValue);
    }
    return;
  }

  const valueType = typeof value;
  if (["string", "boolean"].includes(valueType)) {
    return;
  }
  if (valueType === "number") {
    assert.equal(Number.isFinite(value), true);
    return;
  }

  assert.equal(valueType, "object");
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const [key, nestedValue] of Object.entries(value)) {
    assert.equal(typeof key, "string");
    assertJsonShape(nestedValue);
  }
}
