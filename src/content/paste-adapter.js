import { normalizeOverlayImageBlob } from "../core/image-normalization.js";
import { MAX_WORKING_IMAGE_DIMENSION } from "../core/image-policy.js";
import { MACHINE_STATUS_NOTICE_KIND } from "../core/machine/events.js";
import { createPlacementTransform } from "../core/transform.js";
import { createBrowserImageNormalizationDeps } from "../platform/browser-image-normalization.js";

export function createClipboardImageReader({
  ownerWindow = globalThis.window,
  pageAdapter,
  logger = null,
} = {}) {
  // TODO(smell): Paste reading returns machine-shaped image/status/placement
  // outcomes. Keep clipboard decoding as a platform adapter and move placement
  // derivation/status outcome construction behind the machine paste effect.
  const imageNormalizationDeps = createBrowserImageNormalizationDeps({
    ownerWindow,
    maxWorkingDimension: MAX_WORKING_IMAGE_DIMENSION,
  });

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
        return createStatusNoticeOutcome({
          noticeKind: MACHINE_STATUS_NOTICE_KIND.CLIPBOARD_MISSING_IMAGE,
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
      return createStatusNoticeOutcome({
        noticeKind: MACHINE_STATUS_NOTICE_KIND.CLIPBOARD_MISSING_IMAGE,
      });
    }

    const file = item.getAsFile();
    if (!file) {
      logger?.warn?.("Window paste event image could not be converted to a file");
      return createStatusNoticeOutcome({
        noticeKind: MACHINE_STATUS_NOTICE_KIND.CLIPBOARD_IMAGE_UNREADABLE,
      });
    }

    return readImageBlob(file, "window paste event");
  }

  async function readImageBlob(blob, sourceLabel) {
    try {
      const image = await normalizeOverlayImageBlob(blob, imageNormalizationDeps);
      if (!image) {
        return createStatusNoticeOutcome({
          noticeKind: MACHINE_STATUS_NOTICE_KIND.CLIPBOARD_IMAGE_UNREADABLE,
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
      return createStatusNoticeOutcome({
        noticeKind: MACHINE_STATUS_NOTICE_KIND.CLIPBOARD_IMAGE_UNREADABLE,
      });
    }
  }

  return {
    readClipboardApiImage,
    readClipboardDataImage,
  };
}

export function createLoadedImageOutcome({ image, pageAdapter }) {
  // TODO(smell): Paste completion still derives initial placement in the
  // platform adapter. The final paste ingress should return the decoded image
  // plus page snapshot facts, leaving placement policy to the machine.
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
  };
}

export function createStatusNoticeOutcome({ noticeKind, noticePayload = null }) {
  // TODO(smell): Clipboard failure outcomes are status-notice-shaped. The final
  // adapter should report clipboard result facts; the machine should decide the
  // user-facing status and request lifecycle effects.
  return {
    image: null,
    placement: null,
    noticeKind,
    noticePayload,
  };
}
