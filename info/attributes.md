# Memory attributes

Memories are stored as entities with attribute lines in
`key: value` form inside their observations.

| Attribute  | Input | Stored | Meaning                            |
| ---------- | ----- | ------ | ---------------------------------- |
| `priority` | yes   | yes    | 0-100, default 50                  |
| `tags`     | yes   | yes    | categorization chips               |
| `source`   | yes   | yes    | agent identity                     |
| `u`        | yes   | yes    | originating user ($USER)           |
| `p`        | yes   | yes    | originating project                |
| `exp`      | yes   | yes    | UNIX expiry timestamp              |
| `ttl`      | yes   | no     | seconds; converted to `exp`        |
| `cr`       | yes   | yes    | compression requested              |
| `cs`       | no    | yes    | compression status (0 tbd, 1 done) |

Notes:

- `ttl` is transformed to `exp` when received; only `exp` persists
- `cr` cannot be recalled once set
- `cs` is server-managed output
- Memories without `source` are attributed to **Unclaimed** in the
  memory browser

## Filtering

`search_memories`, `list_memories` and `count_memories` accept
optional `include` and `exclude` objects. Keys: any attribute
(`source`, `u`, `p`, `tag`), plus `minPriority` for a numeric
lower bound.

Include means all keys must match; exclude means any match drops
the memory.

Examples:

```json
{ "include": { "u": "jiri.pech", "minPriority": 91 } }
```

All high priority memories of one user.

```json
{ "include": { "u": "jiri.pech" }, "exclude": { "p": "s19y-mcp" } }
```

Same user, all projects but one.
