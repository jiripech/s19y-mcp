# Agent identity

Every session gets a random codename (for example `Agent Fox`) shown in server logs.
Two ways to have a stable identity:

## Preferred: X-Agent-Name header

Set it in the client MCP config (opencode `headers`):

```json
{ "X-Agent-Name": "monitoring-stuff" }
```

## Fallback: pick from the shared pool

If no header is configured, pick a permanent identity yourself:

1. `retrieve_memory` with name `agent_names` - lists available names
2. Pick the FIRST available name in the list rather than a personal
   favourite (favourites run out and high ordinal variants make
   memories hard to filter for the admin)
3. Tell your user which name you picked
4. Pass it as `source` on every `store_memory` and `update_memory`
   call, in all future sessions

Picking a name marks it taken; the server rotates in the next
ordinal variant (`Cicero` becomes `Cicero the 2nd`). The ordinal is
a collision precaution for near-simultaneous picks, not a status
symbol. The server repeats an `identityNotice` on every tool
response until an identity is established.

## Ownership

Memories carry an advisory `rw` flag: `1` when the source matches
your session identity, `0` otherwise. Treat `rw: 0` memories as
read-only. The system-owned names list rejects modification
entirely and logs attempts.
