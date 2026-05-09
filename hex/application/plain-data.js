export function isPlainData(value) {
  if (value === null) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isPlainData);
  }

  const valueType = typeof value;
  if (["string", "boolean"].includes(valueType)) {
    return true;
  }
  if (valueType === "number") {
    return Number.isFinite(value);
  }
  if (valueType !== "object") {
    return false;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    return false;
  }

  return Object.values(value).every(isPlainData);
}
