import {
  findViewportElement,
  readSurfaceMotion,
} from "./page-dom-reader.js";
import {
  readableObservationDocuments,
} from "./page-observation-runtime.js";
import {
  labelDebugNode,
} from "./debug-label.js";

export function installMapStateDebugProbe({
  ownerWindow,
  eventDebugLogger,
  readPanState,
}) {
  if (!eventDebugLogger?.enabled) {
    return {
      destroy() {},
    };
  }
  let lastSignature = "";

  const sample = (reason) => {
    const snapshots = readableObservationDocuments(ownerWindow).map((document) => mapDebugSnapshot(document));
    const signature = JSON.stringify(snapshots);
    if (signature === lastSignature) {
      return;
    }
    const previous = safeParseJson(lastSignature) ?? [];
    lastSignature = signature;
    for (const [index, snapshot] of snapshots.entries()) {
      const previousSnapshot = previous[index] ?? null;
      if (!previousSnapshot) {
        eventDebugLogger.log("map-state", "observed", {
          reason,
          documentIndex: index,
          ...snapshot,
          panState: readPanState?.(),
        });
        continue;
      }
      const zoomChanged = previousSnapshot.mapView?.zoom !== snapshot.mapView?.zoom;
      const hashChanged = previousSnapshot.hash !== snapshot.hash;
      const surfaceChanged = previousSnapshot.surfaceMotion?.transformCss !== snapshot.surfaceMotion?.transformCss;
      if (zoomChanged || hashChanged || surfaceChanged) {
        eventDebugLogger.log("map-state", zoomChanged ? "zoom-changed" : "changed", {
          reason,
          documentIndex: index,
          from: previousSnapshot,
          to: snapshot,
          zoomChanged,
          hashChanged,
          surfaceChanged,
          panState: readPanState?.(),
        });
      }
    }
  };

  const onEvent = (event) => sample(event.type);
  for (const eventName of ["hashchange", "popstate", "resize"]) {
    ownerWindow.addEventListener(eventName, onEvent);
  }
  const timerId = typeof ownerWindow.setInterval === "function"
    ? ownerWindow.setInterval(() => sample("poll"), 200)
    : null;
  timerId?.unref?.();
  sample("attached");

  return {
    destroy() {
      for (const eventName of ["hashchange", "popstate", "resize"]) {
        ownerWindow.removeEventListener(eventName, onEvent);
      }
      if (timerId !== null && typeof ownerWindow.clearInterval === "function") {
        ownerWindow.clearInterval(timerId);
      }
    },
  };
}

function mapDebugSnapshot(document) {
  const ownerWindow = document.defaultView;
  return {
    href: ownerWindow?.location?.href ?? "",
    hash: ownerWindow?.location?.hash ?? "",
    mapView: parseDebugMapView(ownerWindow?.location?.hash ?? ""),
    viewport: labelDebugNode(findViewportElement(document)),
    surfaceMotion: readSurfaceMotion({
      document,
      ownerWindow,
    }),
  };
}

function parseDebugMapView(hash) {
  const match = /(?:^|[#&])map=(?<zoom>-?\d+(?:\.\d+)?)\/(?<lat>-?\d+(?:\.\d+)?)\/(?<lon>-?\d+(?:\.\d+)?)/u
    .exec(hash ?? "");
  if (!match) {
    return null;
  }
  return {
    zoom: Number(match.groups.zoom),
    centerLatLon: {
      lat: Number(match.groups.lat),
      lon: Number(match.groups.lon),
    },
  };
}

function safeParseJson(value) {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
