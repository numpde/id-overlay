# Hex Test Authority

Tests declare two independent facts in their path:

- `class-a`: authoritative target-shape tests. Moving or weakening these should
  require a strong design argument.
- `class-b`: provisional harness tests. They are useful current evidence, but
  implementation pressure may reveal better names or boundaries.
- `class-c`: suspicious tests. These are quarantined until they are promoted,
  rewritten, or deleted.

Inside each class, the next path segment is the test area:
`architecture`, `domain`, `application`, `adapters`, or `integration`.

This keeps authority separate from subject matter. A class-b application test is
not less "application-shaped"; it is less settled as design evidence.

Class-c tests are classified so they are visible, but they should not become
evidence in class-a architecture checks until they are promoted.

Class-c may reuse class-b support helpers to avoid quarantine-only framework
bloat. That does not promote the class-c scenario itself.

Class-c files prefixed with `candidate-` are possible class-a laws. Keep them
self-contained so promotion is easy to review as a file move.

Promotion criteria:

- `class-c` to `class-b`: promote only after the test describes a product seam
  we still want when nearby implementation details change. Rename or split it
  first if it mainly preserves one speculative scenario.
- `class-b` to `class-a`: promote only after the test describes architecture or
  product shape we would defend during a rewrite. A class-a test should survive
  serious implementation alternatives.
- Demotion is always allowed when a test starts constraining the wrong thing.
  The class path is an authority claim, not a reward.
