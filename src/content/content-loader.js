const EXTENSION_CONTENT_MODULE = "hex/bootstrap/extension-content.js";

void import(chrome.runtime.getURL(EXTENSION_CONTENT_MODULE)).then((module) => (
  module.startExtensionContent({
    location: window.location,
  })
)).catch((error) => {
  console.error("id-overlay: failed to bootstrap", error);
});
