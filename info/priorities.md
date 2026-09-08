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
  into the server-owned `AGENTS.md` file as soon as it is stored
- The transposed file is served at `/info/agents.md` (API key
  required) so agents can load instructions at session start
  without extra tool calls

Users can tell their agent to store high priority memories for
other agents; agents must ask their users before complying.
