export function parseTileMatrixTransform(element) {
  // TODO(smell): Matrix parsing assumes 2D CSS transforms on tile elements.
  // If iD switches transform style, this should fail closed here rather than
  // corrupting placement/projection state.
  const view = element.ownerDocument?.defaultView ?? globalThis;
  const style = typeof view.getComputedStyle === "function"
    ? view.getComputedStyle(element)
    : null;
  const transformCss = style?.transform ?? element.style.transform ?? "";
  const matrixMatch = /matrix\(([^)]+)\)/.exec(transformCss);
  if (matrixMatch) {
    const values = matrixMatch[1].split(",").map((value) => Number(value.trim()));
    if (values.length === 6 && values.every(Number.isFinite)) {
      const [a, b, _c, _d, tx, ty] = values;
      return {
        scale: Math.hypot(a, b),
        tx,
        ty,
      };
    }
  }

  return null;
}
