import {
  CLIPBOARD_IMAGE_READ_KIND,
} from "../core/clipboard-facts.js";
import { createPasteReadOutcomeFromClipboardFact } from "../core/machine/paste-read.js";
import { createPlacementTransform } from "../core/transform.js";

export function createPagePlacedPasteReadOutcome({ fact, pageObservation }) {
  // TODO(smell): This is the content-side bridge from clipboard facts to
  // machine paste outcomes. The ideal service should consume page-snapshot
  // provenance and make "page placement was authoritative" explicit.
  return createPasteReadOutcomeFromClipboardFact({
    fact,
    placement: createInitialPastePlacement({ fact, pageObservation }),
  });
}

function createInitialPastePlacement({ fact, pageObservation }) {
  // TODO(smell): Initial paste placement reads live page snapshot synchronously.
  // It should reject approximate or stale page facts once paste placement policy
  // consumes snapshot provenance.
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
