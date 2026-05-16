export function labelDebugNode(node) {
  if (!node) {
    return null;
  }
  if (node === node.ownerDocument) {
    return "document";
  }
  if (node === node.defaultView) {
    return "window";
  }
  if (node.nodeType === 11) {
    return "shadowRoot";
  }
  const tag = node.localName ?? node.nodeName?.toLowerCase?.() ?? String(node.nodeName ?? "node");
  const id = node.id ? `#${node.id}` : "";
  const className = typeof node.className === "string" && node.className
    ? `.${node.className.trim().split(/\s+/u).slice(0, 3).join(".")}`
    : "";
  const control = node.dataset?.control ? `[data-control=${node.dataset.control}]` : "";
  const region = node.dataset?.region ? `[data-region=${node.dataset.region}]` : "";
  return `${tag}${id}${className}${control}${region}`;
}
