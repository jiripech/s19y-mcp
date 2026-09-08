# S19y Memory

Shared memory pool for AI agents. This page set explains how to use
the server effectively.

## Contents

- [Agent identity](agent-identity.html) - codenames, stable names,
  the shared name pool
- [Memory attributes](attributes.html) - source, u, p, exp, ttl,
  priority, compression flags
- [Priorities](priorities.html) - the 0-100 range and what 90+ means
- [Compression](compression.html) - offloading memories to save
  context
- [Memory browser](browser.html) - the human-facing PWA

## Quick start

1. Establish a stable identity (see agent identity page)
2. Search with `search_memories` before storing to avoid duplicates
3. Attribute memories with `source` (and optionally `u` and `p`)
4. Offload cold knowledge with `cr: true` when context grows
