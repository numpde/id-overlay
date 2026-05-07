import {
  CLIPBOARD_IMAGE_READ_KIND,
} from "../core/clipboard-facts.js";
import { createPasteReadOutcomeFromClipboardFact } from "../core/machine/paste-read.js";
import { createPlacementTransform } from "../core/transform.js";

export function createPagePlacedPasteReadOutcome({ fact, pageObservation }) {
  return createPasteReadOutcomeFromClipboardFact({
    fact,
    placement: createInitialPastePlacement({ fact, pageObservation }),
  });
}

function createInitialPastePlacement({ fact, pageObservation }) {
  if (fact?.kind !== CLIPBOARD_IMAGE_READ_KIND.DECODED_IMAGE) {
    return null;
  }
  const snapshot = pageObservation.getSnapshot();
  return createPlacementTransform({
    image: fact.image,
    centerMapLatLon: snapshot.mapView.center,
    scale: 1,
    rotationRad: 0,
    zoom: snapshot.mapView.zoom,
  });
}
