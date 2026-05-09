export function generateWebAccessibleResources({ contentEntrypoint, importGraph }) {
  const resources = [];
  const seen = new Set([contentEntrypoint]);
  const queue = [...(importGraph[contentEntrypoint] ?? [])];

  while (queue.length > 0) {
    const resource = queue.shift();
    if (seen.has(resource)) {
      continue;
    }
    seen.add(resource);
    resources.push(resource);
    for (const nestedResource of importGraph[resource] ?? []) {
      queue.push(nestedResource);
    }
  }

  return [{
    resources,
    matches: ["<all_urls>"],
  }];
}
