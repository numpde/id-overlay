import { BUILD_INFO } from "./build-info.js";

const PREFIX = `id-overlay@${BUILD_INFO.version} [built ${BUILD_INFO.builtAt}]`;

export function createLogger(scope) {
  const scopePrefix = scope ? `${PREFIX} [${scope}]` : PREFIX;

  return Object.freeze({
    debug(...args) {
      console.debug(scopePrefix, ...args);
    },
    info(...args) {
      console.info(scopePrefix, ...args);
    },
    warn(...args) {
      console.warn(scopePrefix, ...args);
    },
    error(...args) {
      console.error(scopePrefix, ...args);
    },
  });
}

export function formatBuildLabel() {
  return `v${BUILD_INFO.version} · built ${BUILD_INFO.builtAt}`;
}

