import {
  CLIPBOARD_IMAGE_READ_KIND,
} from "../core/clipboard-facts.js";
import { createPasteReadOutcomeFromClipboardFact } from "../core/machine/paste-read.js";
import { createPlacementTransform } from "../core/transform.js";
import { isLivePageSnapshot } from "./page-adapter/page-snapshot.js";

export function createPagePlacedPasteReadOutcome({ fact, pageObservation }) {
  // TODO(smell): This is the content-side bridge from clipboard facts to
  // machine paste outcomes. The ideal service should make "page placement was
  // authoritative" explicit in the paste outcome rather than encoding it as
  // nullable placement.
  return createPasteReadOutcomeFromClipboardFact({
    fact,
    placement: createInitialPastePlacement({ fact, pageObservation }),
  });
}

function createInitialPastePlacement({ fact, pageObservation }) {
  // TODO(smell): Initial paste placement still reads the page snapshot
  // synchronously. Final shape should make paste placement an explicit
  // effect-time fact, not a hidden bridge read.
  if (fact?.kind !== CLIPBOARD_IMAGE_READ_KIND.DECODED_IMAGE) {
    return null;
  }
  const snapshot = pageObservation.getSnapshot();
  if (!isLivePageSnapshot(snapshot)) {
    return null;
  }
  return createPlacementTransform({
    image: fact.image,
    centerMapLatLon: snapshot.mapView.center,
    scale: 1,
    rotationRad: 0,
    zoom: snapshot.mapView.zoom,
  });
}
