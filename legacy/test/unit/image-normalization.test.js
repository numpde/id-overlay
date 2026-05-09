import test from "node:test";
import assert from "node:assert/strict";

import {
  createNormalizedOverlayImage,
  getOverlayImageLoadStats,
  getOverlayImageOriginalDimensions,
  getOverlayImageWorkingDimensions,
  normalizeOverlayImageBlob,
  normalizeOverlayImageMetadata,
} from "../../src/core/image-normalization.js";

test("image metadata normalization upgrades legacy image shape to the canonical model", () => {
  assert.deepEqual(normalizeOverlayImageMetadata({
    src: "data:image/png;base64,abc",
    width: 1200,
    height: 800,
  }), {
    src: "data:image/png;base64,abc",
    width: 1200,
    height: 800,
    original: {
      width: 1200,
      height: 800,
    },
    working: {
      src: "data:image/png;base64,abc",
      width: 1200,
      height: 800,
      scaleFromOriginal: 1,
    },
  });
});

test("normalized image accessors are the single source of working/original image dimensions", () => {
  const image = createNormalizedOverlayImage({
    workingSrc: "data:image/png;base64,abc",
    workingWidth: 2048,
    workingHeight: 1024,
    originalWidth: 5000,
    originalHeight: 2500,
  });

  assert.deepEqual(getOverlayImageWorkingDimensions(image), {
    src: "data:image/png;base64,abc",
    width: 2048,
    height: 1024,
    scaleFromOriginal: 2048 / 5000,
  });
  assert.deepEqual(getOverlayImageOriginalDimensions(image), {
    width: 5000,
    height: 2500,
  });
  assert.deepEqual(getOverlayImageLoadStats(image), {
    workingWidth: 2048,
    workingHeight: 1024,
    originalWidth: 5000,
    originalHeight: 2500,
    wasResized: true,
  });
});

test("blob normalization downscales once and keeps one working-image coordinate space", async () => {
  const calls = [];
  const image = await normalizeOverlayImageBlob(
    { name: "large.png" },
    {
      maxWorkingDimension: 2048,
      async readBlobAsDataUrl() {
        calls.push("read");
        return "data:image/png;base64,raw";
      },
      async measureImage() {
        calls.push("measure");
        return {
          width: 5000,
          height: 2500,
        };
      },
      async resizeImage({ src, width, height }) {
        calls.push(["resize", src, width, height]);
        return "data:image/png;base64,resized";
      },
    },
  );

  assert.deepEqual(calls, [
    "read",
    "measure",
    ["resize", "data:image/png;base64,raw", 2048, 1024],
  ]);
  assert.deepEqual(image, {
    src: "data:image/png;base64,resized",
    width: 2048,
    height: 1024,
    original: {
      width: 5000,
      height: 2500,
    },
    working: {
      src: "data:image/png;base64,resized",
      width: 2048,
      height: 1024,
      scaleFromOriginal: 2048 / 5000,
    },
  });
});

test("blob normalization keeps smaller images unchanged", async () => {
  const calls = [];
  const image = await normalizeOverlayImageBlob(
    { name: "small.png" },
    {
      maxWorkingDimension: 2048,
      async readBlobAsDataUrl() {
        calls.push("read");
        return "data:image/png;base64,raw";
      },
      async measureImage() {
        calls.push("measure");
        return {
          width: 640,
          height: 320,
        };
      },
      async resizeImage() {
        calls.push("resize");
        throw new Error("resize should not be called for in-budget images");
      },
    },
  );

  assert.deepEqual(calls, ["read", "measure"]);
  assert.deepEqual(image, {
    src: "data:image/png;base64,raw",
    width: 640,
    height: 320,
    original: {
      width: 640,
      height: 320,
    },
    working: {
      src: "data:image/png;base64,raw",
      width: 640,
      height: 320,
      scaleFromOriginal: 1,
    },
  });
});
