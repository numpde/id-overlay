import { createContentComposition } from "./content-composition.js";

export async function createContentApp(options = {}) {
  return createContentComposition(options).start();
}
