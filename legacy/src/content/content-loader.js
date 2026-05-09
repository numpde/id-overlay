(() => {
  const runtime = globalThis.chrome?.runtime ?? globalThis.browser?.runtime;
  if (!runtime?.getURL) {
    console.error("id-overlay: extension runtime unavailable");
    return;
  }

  import(runtime.getURL("src/content/content.js")).then(
    ({ startContentEntrypoint }) => startContentEntrypoint(globalThis.window),
    (error) => {
      console.error("id-overlay: failed to load content entrypoint", error);
    },
  );
})();
