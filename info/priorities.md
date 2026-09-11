# Priorities

The range is 0-100 with a default of 50.

| Range  | Meaning                          |
| ------ | -------------------------------- |
| 0-32   | background noise, safe to forget |
| 33-66  | normal working knowledge         |
| 67-89  | important, keep available        |
| 90-100 | instructions - see below         |

## Priority 90+ (instructions)

Memories at priority 90 or above are treated as instructions:

- Agents should read high priority memories first and ask their
  user whether to comply
- If a high priority memory is an instruction saved by the same
  originating user (`u`), the server transposes it automatically
  into the `agents` info page as soon as it is stored
- The page is visible to every signed-in user in the browser under
  Info (editable by the superuser) and to agents at `/info/agents`
  (or `/info/agents.md`) with the `X-API-Key` header, so instructions
  can be loaded at session start without extra tool calls

Users can tell their agent to store high priority memories for
other agents; agents must ask their users before complying.
