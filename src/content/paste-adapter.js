import {
  createBrowserImageNormalizationDeps,
  normalizeOverlayImageBlob,
} from "../core/image-normalization.js";
import { MACHINE_FEEDBACK_KIND } from "../core/machine/events.js";
import { MACHINE_STATUS_MESSAGE } from "../core/machine/selectors.js";
import { describeLoadedImagePresentation } from "../core/presentation.js";
import { createPlacementTransform } from "../core/transform.js";

export function createClipboardImageReader({
  ownerWindow = globalThis.window,
  pageAdapter,
  logger = null,
} = {}) {
  const imageNormalizationDeps = createBrowserImageNormalizationDeps(ownerWindow);

  async function readClipboardApiImage() {
    if (typeof ownerWindow.navigator?.clipboard?.read !== "function") {
      return null;
    }

    try {
      const clipboardItems = await ownerWindow.navigator.clipboard.read();
      const imageType = clipboardItems
        .flatMap((item) => item.types)
        .find((type) => type.startsWith("image/"));

      if (!imageType) {
        logger?.warn?.("Clipboard API read succeeded but no image type was present");
        return createFeedbackOutcome({
          feedbackKind: MACHINE_FEEDBACK_KIND.CLIPBOARD_MISSING_IMAGE,
          message: `Clipboard does not contain an image. ${MACHINE_STATUS_MESSAGE.PASTE_ARMED}`,
        });
      }

      const clipboardItem = clipboardItems.find((item) => item.types.includes(imageType));
      return readImageBlob(await clipboardItem.getType(imageType), "Clipboard API");
    } catch (error) {
      logger?.warn?.("Clipboard API read failed; falling back to manual paste", {
        message: error?.message ?? String(error),
      });
      return null;
    }
  }

  async function readClipboardDataImage(clipboardData) {
    const item = [...(clipboardData?.items ?? [])].find((candidate) =>
      candidate.type.startsWith("image/"),
    );
    if (!item) {
      logger?.warn?.("Window paste event did not contain an image");
      return createFeedbackOutcome({
        feedbackKind: MACHINE_FEEDBACK_KIND.CLIPBOARD_MISSING_IMAGE,
        message: "Clipboard does not contain an image.",
      });
    }

    const file = item.getAsFile();
    if (!file) {
      logger?.warn?.("Window paste event image could not be converted to a file");
      return createFeedbackOutcome({
        feedbackKind: MACHINE_FEEDBACK_KIND.CLIPBOARD_IMAGE_UNREADABLE,
        message: "Clipboard image could not be read.",
      });
    }

    return readImageBlob(file, "window paste event");
  }

  async function readImageBlob(blob, sourceLabel) {
    try {
      const image = await normalizeOverlayImageBlob(blob, imageNormalizationDeps);
      if (!image) {
        return createFeedbackOutcome({
          feedbackKind: MACHINE_FEEDBACK_KIND.CLIPBOARD_IMAGE_UNREADABLE,
          message: "Clipboard image could not be read.",
        });
      }
      logger?.info?.("Loaded clipboard image", {
        source: sourceLabel,
      });
      return createLoadedImageOutcome({ image, pageAdapter });
    } catch (error) {
      logger?.warn?.("Clipboard image could not be read", {
        source: sourceLabel,
        message: error?.message ?? String(error),
      });
      return createFeedbackOutcome({
        feedbackKind: MACHINE_FEEDBACK_KIND.CLIPBOARD_IMAGE_UNREADABLE,
        message: "Clipboard image could not be read.",
      });
    }
  }

  return {
    readClipboardApiImage,
    readClipboardDataImage,
  };
}

export function createLoadedImageOutcome({ image, pageAdapter }) {
  const snapshot = pageAdapter.getSnapshot();
  return {
    image,
    placement: createPlacementTransform({
      image,
      centerMapLatLon: snapshot.mapView.center,
      scale: 1,
      rotationRad: 0,
      zoom: snapshot.mapView.zoom,
    }),
    feedbackMessage: describeLoadedImagePresentation(image) ?? "Loaded image.",
  };
}

export function createFeedbackOutcome({ feedbackKind, message }) {
  return {
    image: null,
    placement: null,
    feedbackKind,
    message,
  };
}
