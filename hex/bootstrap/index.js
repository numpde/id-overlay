// Bootstrap is the composition edge: concrete adapters are assembled here and
// wired to the application. It must not become a product logic layer.
const BOOTSTRAPS_BY_HOST = new WeakMap();

export async function bootstrapBrowserExtension(host) {
  if (host.pageContext?.kind !== "supported-map-editor-page") {
    return {
      kind: "unsupported-page",
    };
  }

  const existingBootstrap = BOOTSTRAPS_BY_HOST.get(host);
  if (existingBootstrap) {
    return existingBootstrap;
  }

  const root = {
    ownerId: "id-overlay",
  };
  const runtime = host.startRuntime({
    kind: "id-overlay-runtime",
  });
  host.mountOwnedRoot("id-overlay", root);

  const bootstrap = {
    kind: "bootstrapped",
    runtime,
    root,
  };
  BOOTSTRAPS_BY_HOST.set(host, bootstrap);
  return bootstrap;
}
