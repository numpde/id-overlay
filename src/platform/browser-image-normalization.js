import { MAX_WORKING_IMAGE_DIMENSION } from "../core/image-policy.js";

export function createBrowserImageNormalizationDeps(ownerWindow = globalThis.window) {
  return {
    maxWorkingDimension: MAX_WORKING_IMAGE_DIMENSION,
    readBlobAsDataUrl(blob) {
      return readBlobAsDataUrl(blob, ownerWindow);
    },
    measureImage(src) {
      return measureImageSource(src, ownerWindow);
    },
    resizeImage({ src, width, height }) {
      return resizeImageSource({ src, width, height }, ownerWindow);
    },
  };
}

function readBlobAsDataUrl(blob, ownerWindow) {
  return new Promise((resolve, reject) => {
    const reader = new ownerWindow.FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
}

function measureImageSource(src, ownerWindow) {
  return new Promise((resolve, reject) => {
    const image = new ownerWindow.Image();
    image.addEventListener("load", () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    });
    image.addEventListener("error", reject);
    image.src = src;
  });
}

function resizeImageSource({ src, width, height }, ownerWindow) {
  return new Promise((resolve, reject) => {
    const image = new ownerWindow.Image();
    image.addEventListener("load", () => {
      const canvas = ownerWindow.document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Canvas 2D context is unavailable."));
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/png"));
    });
    image.addEventListener("error", reject);
    image.src = src;
  });
}
