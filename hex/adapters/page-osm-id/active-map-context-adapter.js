export function createActiveMapContextAdapter({
  readLocation,
  findEmbeddedEditorFrame = () => null,
}) {
  return {
    readActiveMapContext() {
      const location = readLocation();
      if (!isSupportedOpenStreetMapIdEditor(location)) {
        return {
          kind: "unsupported-page",
        };
      }

      const editorFrame = findEmbeddedEditorFrame();
      if (editorFrame) {
        return {
          kind: "supported-map-editor-page",
          surface: {
            kind: "embedded-editor-frame",
          },
        };
      }

      return {
        kind: "supported-map-editor-page",
        surface: {
          kind: "native-page",
        },
      };
    },
  };
}

function isSupportedOpenStreetMapIdEditor(location) {
  return location?.origin === "https://www.openstreetmap.org"
    && location.pathname === "/edit"
    && new URLSearchParams(location.search).get("editor") === "id";
}
