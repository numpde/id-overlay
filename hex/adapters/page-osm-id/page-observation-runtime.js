import {
  findViewportElement,
  readSurfaceMotion,
} from "./page-dom-reader.js";

export const SURFACE_MOTION_EVENT_TYPE = "id-overlay:surface-motion";

export function observePageSnapshots({
  ownerWindow,
  listener,
  eventDebugLogger = null,
}) {
  let disposed = false;
  let lastObservedSignature = observationSignature(ownerWindow);
  let pollTimer = null;
  let notifyQueued = false;
  let notifyDelayTimer = null;
  const observedDocuments = [];
  const notifyNow = () => {
    if (disposed) {
      return;
    }
    notifyDelayTimer = null;
    eventDebugLogger?.log("page-observation", "notify-fired", {
      documents: observationDebugRecords(ownerWindow),
    });
    listener();
    observeKnownDocuments();
  };
  const notify = ({ defer = false, source = "unknown" } = {}) => {
    eventDebugLogger?.log("page-observation", "notify-requested", {
      source,
      defer,
      notifyQueued,
      delayed: notifyDelayTimer !== null,
    });
    if (disposed || notifyQueued) {
      if (!disposed && notifyQueued && !defer && notifyDelayTimer !== null) {
        cancelObservationTimer(ownerWindow, notifyDelayTimer);
        notifyDelayTimer = null;
        eventDebugLogger?.log("page-observation", "notify-upgraded", {
          source,
          from: "deferred",
          to: "microtask",
        });
        queueMicrotaskForWindow(ownerWindow, () => {
          notifyQueued = false;
          notifyNow();
        });
      } else if (!disposed) {
        eventDebugLogger?.log("page-observation", "notify-coalesced", {
          source,
          defer,
        });
      }
      return;
    }
    notifyQueued = true;
    if (defer) {
      eventDebugLogger?.log("page-observation", "notify-queued", {
        source,
        queue: "deferred-frame",
      });
      notifyDelayTimer = queueObservationForWindow(ownerWindow, () => {
        notifyQueued = false;
        notifyNow();
      });
      return;
    }
    eventDebugLogger?.log("page-observation", "notify-queued", {
      source,
      queue: "microtask",
    });
    queueMicrotaskForWindow(ownerWindow, () => {
      notifyQueued = false;
      notifyNow();
    });
  };

  function observeKnownDocuments() {
    const documents = readableObservationDocuments(ownerWindow);
    pruneUnobservedDocuments(documents);
    for (const document of documents) {
      observeDocument(document);
    }
    for (const record of observedDocuments) {
      observeSurfaceMotionElement(record);
    }
  }

  function pruneUnobservedDocuments(documents) {
    for (let index = observedDocuments.length - 1; index >= 0; index -= 1) {
      const record = observedDocuments[index];
      if (documents.includes(record.document)) {
        continue;
      }
      disposeObservedDocument(record);
      observedDocuments.splice(index, 1);
    }
  }

  function observeDocument(document) {
    if (!document || observedDocuments.some((record) => record.document === document)) {
      return;
    }
    const record = {
      document,
      documentObserver: null,
      surface: null,
      surfaceObserver: null,
      window: document.defaultView ?? null,
    };
    observedDocuments.push(record);
    observeDocumentWindow(record);
    const mutationObserver = document.defaultView?.MutationObserver ?? ownerWindow.MutationObserver;
    if (typeof mutationObserver !== "function" || !document.documentElement) {
      return;
    }
    record.documentObserver = new mutationObserver(() => notify({
      source: "document-mutation",
    }));
    record.documentObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-id-overlay-surface-motion"],
      childList: true,
      subtree: true,
    });
  }

  function observeDocumentWindow(record) {
    if (!record.window || record.window === ownerWindow) {
      return;
    }
    for (const eventName of ["hashchange", "popstate"]) {
      record.window.addEventListener(eventName, notifyDeferred);
    }
    for (const eventName of ["resize"]) {
      record.window.addEventListener(eventName, notifyImmediate);
    }
  }

  function observeSurfaceMotionElement(record) {
    const surface = record.document.querySelector?.(".supersurface") ?? null;
    if (surface === record.surface) {
      return;
    }
    record.surfaceObserver?.disconnect();
    record.surfaceObserver = null;
    record.surface = surface;
    const mutationObserver = record.document.defaultView?.MutationObserver ?? ownerWindow.MutationObserver;
    if (!surface || typeof mutationObserver !== "function") {
      return;
    }
    record.surfaceObserver = new mutationObserver(() => notify({
      source: "surface-mutation",
    }));
    record.surfaceObserver.observe(surface, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });
  }

  for (const eventName of ["hashchange", "popstate"]) {
    ownerWindow.addEventListener(eventName, notifyDeferred);
  }
  for (const eventName of ["resize", "scroll", SURFACE_MOTION_EVENT_TYPE]) {
    ownerWindow.addEventListener(eventName, notifyImmediate, eventName === "scroll" ? { passive: true } : undefined);
  }
  observeKnownDocuments();
  if (!isJsdomWindow(ownerWindow) && typeof ownerWindow.setInterval === "function") {
    pollTimer = ownerWindow.setInterval(() => {
      const nextSignature = observationSignature(ownerWindow);
      if (nextSignature === lastObservedSignature) {
        return;
      }
      const previousSignature = lastObservedSignature;
      lastObservedSignature = nextSignature;
      const previous = safeParseJson(previousSignature) ?? [];
      const next = safeParseJson(nextSignature) ?? [];
      const defer = shouldDeferPolledObservationChange({
        previous,
        next,
      });
      eventDebugLogger?.log("page-observation", "poll-change", {
        defer,
        previous: observationDebugRecordsFromSignature(previous),
        next: observationDebugRecordsFromSignature(next),
      });
      notify({
        defer,
        source: "poll",
      });
    }, 50);
    pollTimer?.unref?.();
  }
  return () => {
    disposed = true;
    notifyQueued = false;
    if (pollTimer !== null && typeof ownerWindow.clearInterval === "function") {
      ownerWindow.clearInterval(pollTimer);
      pollTimer = null;
    }
    if (notifyDelayTimer !== null) {
      cancelObservationTimer(ownerWindow, notifyDelayTimer);
      notifyDelayTimer = null;
    }
    for (const record of observedDocuments.splice(0)) {
      disposeObservedDocument(record);
    }
    for (const eventName of ["hashchange", "popstate"]) {
      ownerWindow.removeEventListener(eventName, notifyDeferred);
    }
    for (const eventName of ["resize", "scroll", SURFACE_MOTION_EVENT_TYPE]) {
      ownerWindow.removeEventListener(eventName, notifyImmediate);
    }
  };

  function disposeObservedDocument(record) {
    record.surfaceObserver?.disconnect();
    record.documentObserver?.disconnect();
    if (record.window && record.window !== ownerWindow) {
      for (const eventName of ["hashchange", "popstate"]) {
        record.window.removeEventListener(eventName, notifyDeferred);
      }
      for (const eventName of ["resize"]) {
        record.window.removeEventListener(eventName, notifyImmediate);
      }
    }
  }

  function notifyDeferred(event) {
    notify({
      defer: true,
      source: event?.type ?? "deferred-event",
    });
  }

  function notifyImmediate(event) {
    notify({
      source: event?.type ?? "immediate-event",
    });
  }
}

export function readableObservationDocuments(ownerWindow) {
  const documents = [];
  if (ownerWindow.document) {
    documents.push(ownerWindow.document);
  }
  const frame = ownerWindow.document?.querySelector?.("#id-embed") ?? null;
  try {
    if (frame?.contentDocument) {
      documents.push(frame.contentDocument);
    }
  } catch {
    // Cross-frame DOM access is optional; frame-local content scripts observe
    // their own document directly.
  }
  return documents;
}

function shouldDeferPolledObservationChange({ previous, next }) {
  const length = Math.max(previous.length, next.length);
  let hrefChanged = false;
  for (let index = 0; index < length; index += 1) {
    const before = previous[index] ?? {};
    const after = next[index] ?? {};
    if (JSON.stringify(before.surfaceMotion) !== JSON.stringify(after.surfaceMotion)) {
      return false;
    }
    if (JSON.stringify(before.viewport) !== JSON.stringify(after.viewport)) {
      return false;
    }
    if (before.href !== after.href) {
      hrefChanged = true;
    }
  }
  return hrefChanged;
}

function queueMicrotaskForWindow(ownerWindow, callback) {
  if (typeof ownerWindow.queueMicrotask === "function") {
    ownerWindow.queueMicrotask(callback);
    return;
  }
  if (typeof queueMicrotask === "function") {
    queueMicrotask(callback);
    return;
  }
  Promise.resolve().then(callback);
}

function queueObservationForWindow(ownerWindow, callback) {
  if (!isJsdomWindow(ownerWindow) && typeof ownerWindow.requestAnimationFrame === "function") {
    return ownerWindow.requestAnimationFrame(callback);
  }
  if (typeof ownerWindow?.setTimeout === "function") {
    return ownerWindow.setTimeout(callback, 0);
  }
  return setTimeout(callback, 0);
}

function cancelObservationTimer(ownerWindow, timerId) {
  if (!isJsdomWindow(ownerWindow) && typeof ownerWindow.cancelAnimationFrame === "function") {
    ownerWindow.cancelAnimationFrame(timerId);
    return;
  }
  if (typeof ownerWindow?.clearTimeout === "function") {
    ownerWindow.clearTimeout(timerId);
    return;
  }
  clearTimeout(timerId);
}

function observationSignature(ownerWindow) {
  return JSON.stringify(readableObservationDocuments(ownerWindow).map((document) => {
    const viewport = findViewportElement(document);
    const viewportRect = viewport?.getBoundingClientRect?.();
    const surfaceMotion = readSurfaceMotion({
      document,
      ownerWindow: document.defaultView ?? ownerWindow,
    });
    return {
      href: document.defaultView?.location?.href ?? "",
      viewport: viewportRect
        ? {
            left: viewportRect.left,
            top: viewportRect.top,
            width: viewportRect.width,
            height: viewportRect.height,
          }
        : null,
      surfaceMotion,
    };
  }));
}

function observationDebugRecords(ownerWindow) {
  return observationDebugRecordsFromSignature(safeParseJson(observationSignature(ownerWindow)) ?? []);
}

function observationDebugRecordsFromSignature(records) {
  return records.map((record) => ({
    href: record.href,
    hash: hashFromHref(record.href),
    mapView: parseDebugMapView(hashFromHref(record.href)),
    viewport: record.viewport,
    surfaceMotion: record.surfaceMotion,
  }));
}

function parseDebugMapView(hash) {
  const match = /(?:^|[#&])map=(?<zoom>-?\d+(?:\.\d+)?)\/(?<lat>-?\d+(?:\.\d+)?)\/(?<lon>-?\d+(?:\.\d+)?)/u
    .exec(hash ?? "");
  if (!match) {
    return null;
  }
  return {
    zoom: Number(match.groups.zoom),
    centerLatLon: {
      lat: Number(match.groups.lat),
      lon: Number(match.groups.lon),
    },
  };
}

function hashFromHref(href) {
  if (typeof href !== "string") {
    return "";
  }
  const hashIndex = href.indexOf("#");
  return hashIndex >= 0 ? href.slice(hashIndex) : "";
}

function safeParseJson(value) {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isJsdomWindow(ownerWindow) {
  return /\bjsdom\b/i.test(ownerWindow.navigator?.userAgent ?? "");
}
