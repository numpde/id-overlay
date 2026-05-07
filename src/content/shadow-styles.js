export async function attachShadowStyles(shadow) {
  if (shadow.querySelector('link[data-id-overlay-styles="true"]')) {
    return;
  }
  const runtime = globalThis.chrome?.runtime ?? globalThis.browser?.runtime;
  const stylesheetUrl = runtime.getURL("src/content/content.css");
  const link = shadow.ownerDocument.createElement("link");
  link.dataset.idOverlayStyles = "true";
  link.rel = "stylesheet";
  link.href = stylesheetUrl;
  shadow.append(link);
  await new Promise((resolve) => {
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", resolve, { once: true });
  });
}
