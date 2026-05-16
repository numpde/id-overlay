export function isExtensionOwnedNode(node) {
  return node?.id === "id-overlay"
    || node?.dataset?.idOverlayOwned === "true"
    || node?.getRootNode?.()?.host?.id === "id-overlay";
}
