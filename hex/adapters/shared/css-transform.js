export function cssTransformAverageScale(transformCss) {
  const matrix = parseCssTransformMatrix(transformCss);
  if (!matrix) {
    return 1;
  }
  const xScale = Math.hypot(matrix.values[0], matrix.values[1]);
  const yScale = Math.hypot(matrix.values[matrix.cIndex], matrix.values[matrix.dIndex]);
  return (xScale + yScale) / 2;
}

export function cssTransformIsIdentity(transformCss) {
  const normalizedTransformCss = String(transformCss ?? "").trim();
  if (!normalizedTransformCss || normalizedTransformCss === "none") {
    return true;
  }
  if (cssTransformIsZeroTranslate(normalizedTransformCss)) {
    return true;
  }
  const matrix = parseCssTransformMatrix(normalizedTransformCss);
  if (!matrix) {
    return false;
  }
  return matrix.values.every((value, index) => value === matrix.identityValues[index]);
}

export function cssTransformTileFacts(transformCss) {
  const matrix = parseCssTransformMatrix(transformCss);
  if (!matrix) {
    return null;
  }
  const scale = Math.hypot(matrix.values[0], matrix.values[1]);
  if (!Number.isFinite(scale) || scale <= 0) {
    return null;
  }
  return {
    x: matrix.values[matrix.xIndex],
    y: matrix.values[matrix.yIndex],
    scale,
  };
}

const MATRIX_IDENTITY_VALUES = [
  1, 0, 0, 1, 0, 0,
];

const MATRIX_3D_IDENTITY_VALUES = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

function parseCssTransformMatrix(transformCss) {
  const functionMatch = /^(?<name>matrix|matrix3d)\((?<body>[^)]+)\)$/u.exec(String(transformCss ?? "").trim());
  if (!functionMatch?.groups) {
    return null;
  }
  const values = functionMatch.groups.body
    .split(",")
    .map((value) => Number(value.trim()));
  if (functionMatch.groups.name === "matrix" && values.length === 6 && values.every(Number.isFinite)) {
    return {
      cIndex: 2,
      dIndex: 3,
      identityValues: MATRIX_IDENTITY_VALUES,
      values,
      xIndex: 4,
      yIndex: 5,
    };
  }
  if (functionMatch.groups.name === "matrix3d" && values.length === 16 && values.every(Number.isFinite)) {
    return {
      cIndex: 4,
      dIndex: 5,
      identityValues: MATRIX_3D_IDENTITY_VALUES,
      values,
      xIndex: 12,
      yIndex: 13,
    };
  }
  return null;
}

function cssTransformIsZeroTranslate(transformCss) {
  const functionMatch = /^(?<name>translate|translate3d)\((?<body>[^)]+)\)$/u.exec(transformCss);
  if (!functionMatch?.groups) {
    return false;
  }
  const values = functionMatch.groups.body
    .split(",")
    .map((value) => value.trim());
  const expectedLength = functionMatch.groups.name === "translate" ? [1, 2] : [3];
  return expectedLength.includes(values.length)
    && values.every(cssLengthIsZero);
}

function cssLengthIsZero(value) {
  return /^[-+]?0(?:\.0+)?(?:[a-z%]+)?$/iu.test(value);
}
