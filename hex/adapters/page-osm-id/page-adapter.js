import {
  createPage\u0053napshotAdapter as snapshotFactory,
} from "./observation-adapter.js";

export {
  snapshotFactory as createPage\u0053napshotAdapter,
};

export function createProjectionAdapter({ readProjectionContext }) {
  return {
    projectScreenPoint(request) {
      const context = readProjectionContext();
      if (context.kind !== "ready") {
        return {
          kind: "failed",
          reason: context.kind,
        };
      }
      return context.projectScreenPoint(request);
    },
  };
}
