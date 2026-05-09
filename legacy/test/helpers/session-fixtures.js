import { normalizeSessionImage } from "../../src/core/session.js";

export const IMAGE_SRC = "data:image/png;base64,abc";

export function createImageFixture({
  src = IMAGE_SRC,
  width = 800,
  height = 400,
} = {}) {
  return Object.freeze({ src, width, height });
}

export const IMAGE = createImageFixture();

export const NORMALIZED_IMAGE = normalizeSessionImage(IMAGE);

export const PLACEMENT = Object.freeze({
  type: "similarity",
  a: 1,
  b: 0,
  tx: 10,
  ty: 20,
  scale: 1,
  rotationRad: 0,
});

export const MOVED_PLACEMENT = Object.freeze({
  ...PLACEMENT,
  tx: 40,
  ty: 10,
});
