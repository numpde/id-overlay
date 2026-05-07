import {
  CLIPBOARD_IMAGE_READ_KIND,
} from "../core/clipboard-facts.js";
import { createPasteReadOutcomeFromClipboardFact } from "../core/machine/paste-read.js";
import { createPlacementTransform } from "../core/transform.js";

export function createPagePlacedPasteReadOutcome({ fact, pageObservation }) {
  // TODO(smell): This is the content-side bridge from clipboard facts to
  // machine paste outcomes. The ideal service should make "page placement was
  // available" explicit rather than always asking live page observation here.
  return createPasteReadOutcomeFromClipboardFact({
    fact,
    placement: createInitialPastePlacement({ fact, pageObservation }),
  });
}

function createInitialPastePlacement({ fact, pageObservation }) {
  // TODO(smell): Initial paste placement reads live page snapshot synchronously.
  // If snapshot provenance becomes explicit, this should reject approximate or
  // stale page facts instead of blindly centering on the current fallback map.
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
