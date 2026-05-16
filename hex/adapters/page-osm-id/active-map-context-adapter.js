export function createActiveMapContextAdapter({
  readLocation,
  findEmbeddedEditorFrame = () => null,
}) {
  return {
    readActiveMapContext() {
      try {
        const location = readLocation();
        if (!isSupportedOpenStreetMapEditLocation(location)) {
          return {
            kind: "unsupported-page",
          };
        }
        const embeddedFrame = normalizeEmbeddedEditorFrame(findEmbeddedEditorFrame());
        return {
          kind: "supported-map-editor-page",
          surface: embeddedFrame
            ? {
                kind: "embedded-editor-frame",
                mapWindow: embeddedFrame.contentWindow,
                viewportDocument: embeddedFrame.contentDocument,
                frameElement: embeddedFrame,
              }
            : {
                kind: "native-page",
              },
        };
      } catch {
        return {
          kind: "unsupported-page",
        };
      }
    },
  };
}

function isSupportedOpenStreetMapEditLocation(location) {
  return location.origin === "https://www.openstreetmap.org"
    && (
      location.pathname === "/edit"
        || location.pathname.startsWith("/edit/")
    );
}

function normalizeEmbeddedEditorFrame(frame) {
  if (!frame) {
    return null;
  }
  try {
    const frameWindow = frame.contentWindow;
    const frameDocument = frame.contentDocument;
    const frameLocation = frameWindow?.location;
    if (
      !frameWindow
        || !frameDocument
        || frameLocation?.origin !== "https://www.openstreetmap.org"
        || !frameLocation?.pathname?.startsWith("/id")
    ) {
      return null;
    }
    return frame;
  } catch {
    return null;
  }
}
