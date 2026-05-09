(() => {
  const runtime = globalThis.chrome?.runtime;
  if (!runtime) {
    return;
  }

  import(runtime.getURL("src/content/main.js"))
    .then((module) => module.start({
      chrome: globalThis.chrome,
      document: globalThis.document,
      location: globalThis.location,
    }))
    .catch((error) => {
      console.error("id-overlay: failed to bootstrap", error);
    });
})();
