import { createContentApp } from "./content-app.js";
import { createPageAdapter } from "./page-adapter.js";
import { BUILD_INFO } from "../core/build-info.js";
import { createLogger } from "../core/logger.js";

export async function bootstrapIdOverlay({ keyboardGateway = null } = {}) {
  const logger = createLogger("main");
  const pagePorts = createPageAdapter();
  if (!pagePorts.pageSession.isSupported()) {
    logger.debug("Skipping unsupported page", {
      href: globalThis.location?.href ?? null,
      build: BUILD_INFO,
    });
    return;
  }
  logger.info("Bootstrapping extension", {
    href: globalThis.location?.href ?? null,
    build: BUILD_INFO,
  });

  await createContentApp({
    ownerWindow: window,
    pagePorts,
    keyboardGateway,
    logger,
  });

  logger.info("Bootstrap complete");
}

export function queueBootstrapIdOverlay({ keyboardGateway = null } = {}) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      bootstrapIdOverlay({ keyboardGateway });
    }, { once: true });
    return;
  }
  bootstrapIdOverlay({ keyboardGateway });
}
