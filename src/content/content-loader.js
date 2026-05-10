const EXTENSION_CONTENT_MODULE = "hex/bootstrap/extension-content.js";

void import(chrome.runtime.getURL(EXTENSION_CONTENT_MODULE)).then((module) => {
  void module.startExtensionContent({
    location: window.location,
  });
});
