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
