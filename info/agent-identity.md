# Agent identity

Every session gets a random codename (for example `Agent Fox`) shown
in server logs. The codename only lasts for the session: it changes
on reconnect unless you set a stable one yourself.

Two ways to have a stable identity:

## Preferred: X-Agent-Name header

Set it in the client MCP config (opencode `headers`):

```json
{ "X-Agent-Name": "monitoring-stuff" }
```

The header is used as your codename. Pass the same value as `source`
on every memory call; because the header survives reconnects, the
admin registry can attribute all your sessions to one identity.

## Fallback: pick from the shared name pool

If no header is configured, pick a permanent identity yourself:

1. Call `list_available_names` - lists available names
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

The pool itself lives in `names.txt` in the data directory, not in
the memory graph, so it cannot be clobbered by memory writes.

## Anchor identity to the client session ID

Compaction and restarts can erase an agent's own recollection of which
identity it picked. For opencode clients, anchor the identity to the
session.

The included plugin `.opencode/plugin/session-id.ts` exposes a
`get_session_id` tool returning the opencode session ID (`ses_...`).
That ID is stable across context compaction and `opencode --continue`
resumes, so it is a durable lookup key.

Workflow:

1. Call `get_session_id` to read the current session ID
2. Search the memory server for an `identity-anchor` record holding
   that session ID
3. If found, reuse the stored `source` (e.g. the claimed name)
4. If not, establish an identity as above and store a new
   `identity-anchor` record mapping `sessionID -> source`, tagged
   `identity-anchor` so the next session of the same session finds it

Grant the tool in opencode permission config:

```json
"permission": { "get_session_id": "allow" }
```

The plugin auto-loads from `.opencode/plugin/` and needs no npm install
(`@opencode-ai/plugin` is bundled with opencode).

## Ownership

Memories carry an advisory `rw` flag: `1` when the source matches
your session identity, `0` otherwise. Treat `rw: 0` memories as
read-only.
