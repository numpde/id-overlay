export function createPageSnapshotAdapter({ readPage }) {
  return {
    readSnapshot() {
      const page = readPage();
      return {
        kind: "supported-map-page",
        mapView: parseMapHash(page.hash),
        viewportPx: {
          width: page.viewport.width,
          height: page.viewport.height,
        },
        tileTransform: page.tileTransform,
      };
    },
  };
}

export function createProjectionAdapter({ readProjectionContext }) {
  return {
    projectScreenPoint() {
      const context = readProjectionContext();
      if (context.kind !== "ready") {
        return {
          kind: "failed",
          reason: context.kind,
        };
      }
      return context.project();
    },
  };
}

export function createGestureForwardingAdapter({ forwardGesture }) {
  return {
    forward(gestureFact) {
      return forwardGesture(gestureFact);
    },
  };
}

function parseMapHash(hash) {
  const match = /^#map=([^/]+)\/([^/]+)\/([^/]+)$/.exec(hash);
  return {
    zoom: Number(match[1]),
    centerLatLon: {
      lat: Number(match[2]),
      lon: Number(match[3]),
    },
  };
}
