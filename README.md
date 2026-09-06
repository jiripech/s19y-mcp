# S19y MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> Self Reflexion Memory MCP Server built with agents for agents

## Description

S19y MCP Server is a
[Model Context Protocol](https://en.wikipedia.org/wiki/Model_Context_Protocol)
(MCP) server that provides self-reflexion memory capabilities for AI agents.
It enables agents to store, retrieve, and reflect on their experiences,
creating a persistent memory layer that enhances agent capabilities.

## Features

- **Self-Reflexion Memory** -
  Agents can store and retrieve reflections on their actions
- **MCP Compliant** -
  Built on the Model Context Protocol standard
- **Docker Ready** -
  Containerized deployment for easy setup
- **Agent-Agnostic** -
  Works with any MCP-compatible AI agent

## Installation

### Using Docker (Recommended)

A prebuilt image is published on Docker Hub. Pull and run it directly,
no source checkout or build required:

```bash
docker pull hqcz/s19y-mcp:latest
docker run -d \
  -p 3000:3000 \
  -e API_KEY=your-api-key-here \
  -v s19y-data:/app/data \
  hqcz/s19y-mcp:latest
```

- `-v s19y-data:/app/data` persists memories across container restarts.
- Set `API_KEY` to the key your MCP clients will authenticate with.
- See [Configuration](#configuration) for all environment variables.

### Build from source

For development or building your own image:

```bash
git clone https://github.com/jiripech/s19y-mcp.git
cd s19y-mcp
docker build -t s19y-mcp .
docker run -p 3000:3000 -e API_KEY=your-api-key-here s19y-mcp
```

### Push to Docker Hub

Maintainers can build and push the multi-arch image:

```bash
DOCKER_NAMESPACE=your-user DOCKER_TAG=1.0.0 ./scripts/build.sh
```

### Configure opencode client

The server speaks MCP over both
[Streamable HTTP](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
(`/mcp`) and legacy SSE (`/sse`). Streamable HTTP is recommended.
Add it to your opencode config:

```json
{
  "mcp": {
    "shared-memory": {
      "type": "remote",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "X-API-Key": "your-api-key-here",
        "X-Agent-Name": "my-agent"
      }
    }
  }
}
```

The optional `X-Agent-Name` header gives the session a stable name in
logs and the memory browser instead of a random codename.

The server exposes eight MCP tools, available to agents as
`shared-memory_<tool>`. To let all agents use the shared memory freely,
allow them in the opencode `permission` block:

```json
{
  "permission": {
    "shared-memory_list_memories": "allow",
    "shared-memory_count_memories": "allow",
    "shared-memory_list_sources": "allow",
    "shared-memory_retrieve_memory": "allow",
    "shared-memory_search_memories": "allow",
    "shared-memory_store_memory": "allow",
    "shared-memory_update_memory": "allow",
    "shared-memory_delete_memory": "allow"
  }
}
```

| Tool              | Description                                           |
| ----------------- | ----------------------------------------------------- |
| `store_memory`    | Store memories (optional `source`, batch `memories`)  |
| `update_memory`   | Update an existing memory (content, tags, source)     |
| `retrieve_memory` | Retrieve a memory by name (optional `source` filter)  |
| `search_memories` | Search memories (optional `source` filter)            |
| `list_memories`   | List all stored memories (optional `source` filter)   |
| `count_memories`  | Count stored memories (optional `source` filter)      |
| `list_sources`    | List all unique sources with memory counts            |
| `delete_memory`   | Delete a memory (optional `source` guard)             |

Restart opencode after changing the config.

### Memory attribution

All agents share one memory pool. To attribute a memory to an agent,
pass an optional `source` to `store_memory`; the server stamps it with
a `source: <value>` tag. Both `search_memories` and `list_memories`
accept an optional `source` to filter results to one agent:

```json
{
  "source": "agent-X"
}
```

Attribution keeps the store shared while making it filterable. It is an
explicit design choice over per-agent isolation: shared memories can be
searched across all agents, or narrowed to a single contributor.
Memories returned by `retrieve_memory`, `search_memories`, and
`list_memories` carry an advisory `rw` flag: `1` when the memory's
source matches the calling session's claimed identity, `0` when it
belongs to another identity, an unclaimed author, or the system.
Agents are told to treat `rw: 0` memories as read-only; the system
enforces this only for server-owned memories such as `agent_names`.
Memories without any source are attributed to **Unclaimed** in the
memory browser.

### Details

See the
[opencode MCP configuration docs](https://opencode.ai/docs/config/)
for more options.

### Local Development

```bash
git clone https://github.com/jiripech/s19y-mcp.git
cd s19y-mcp
npm install
npm run dev
```

## Usage

The server will expose MCP tools for memory operations that your agent can
utilize.

Once running, set your API key and connect your MCP-compatible agent to the server.

Each MCP session is assigned a random agent codename (e.g. "Agent Fox")
shown in connect and disconnect logs. A client can choose a stable name
by sending an `X-Agent-Name` header (values are trimmed, capped at 64
characters, and fall back to a random codename if already in use).
Look up the codename of a session with `GET /session` (pass the
`Mcp-Session-Id` header or a `sessionId` query parameter). Names are
released back to the pool when the session closes.

### Agent self-identification

Agents without an `X-Agent-Name` header can pick a permanent identity
themselves: the server maintains a protected shared memory
`agent_names` listing the currently available names (Roman
philosophers). An agent retrieves it, chooses a name, introduces
itself to its user with that name, and passes it as `source` on every
`store_memory` and `update_memory` call. When the server sees a `source`
matching an available name it marks it taken and rotates in the next
ordinal variant ("Cicero" becomes "Cicero the 2nd", and so on), so the
list always reflects what is still available.

To make the requirement stick, the server appends an
`identityNotice` to every tool response of an unidentified session
(reminding the agent to pick a name and introduce itself to its
user) until the agent either arrives with an `X-Agent-Name` header
or uses a `source` attribution for the first time.
`GET /session` reports the current state via its `identified` field.

The `agent_names` memory is managed by the server only: MCP
`update_memory` / `delete_memory` and the browser superuser UI reject
modifications. The available-name list is persisted in `names.txt`
inside the data directory (seeded on first start) and restored from
there on startup.

Sessions are held in memory. After a server restart every client's
session is gone; requests carrying a stale session ID are answered
with HTTP 404 (`Session not found`), the MCP-standard signal for a
client to re-initialize and open a fresh session. Spec-compliant
clients such as opencode recover automatically.

## Memory browser

The server ships a memory browser PWA (vanilla JS, Liquid Glass UI)
served at `/browser.app`. Open it in a browser and register a passkey
(WebAuthn/FIDO2) to sign in:

- The first registered user becomes the superuser; any further
  registration needs the `REGISTRATION_TOKEN` value
- The superuser can list and delete users, change the registration
  token, and create, edit, or delete any memory
- Browser users and passkeys persist in `users.json` inside the data
  directory (`/app/data`), next to the memory file

Passkeys require a **secure context**: the browser only offers
WebAuthn on HTTPS origins or on `localhost`. Plain HTTP on a LAN IP
(for example `http://10.0.0.222:12300/browser.app/`) is blocked by the
browser - the pages warn about this. Options:

- Terminate TLS in your reverse proxy (haproxy, caddy, nginx) and
  access the browser through the HTTPS hostname; set
  `BROWSER_SCHEME=https` and `BROWSER_HOSTNAME` to that hostname so
  WebAuthn origin verification matches
- For quick local testing, forward the port to your workstation
  (`ssh -L 12300:localhost:12300 <host>`) and open
  `http://localhost:12300/browser.app/` with `BROWSER_HOSTNAME=localhost`
- Skip passkeys entirely: set `ADMIN_USER` and sign in on the login
  page with that username and the 8-character password printed in the
  server log at startup (single account, superuser rights, intended
  for trusted networks)

## Configuration

| Variable             | Description              | Default                   |
| -------------------- | ------------------------ | ------------------------- |
| `PORT`               | Server port              | `3000`                    |
| `API_KEY`            | MCP client auth key      | `none`                    |
| `DATA_DIR`           | Data storage directory   | `/app/data`               |
| `MEMORY_FILE_PATH`   | Memory file location     | `<DATA_DIR>/memory.jsonl` |
| `LOG_LEVEL`          | Log level (info/debug)   | `info`                    |
| `NODE_ENV`           | Environment              | `development`             |
| `REGISTRATION_TOKEN` | Registration token       | `none`                    |
| `BROWSER_HOSTNAME`   | WebAuthn RP ID           | server hostname           |
| `BROWSER_SCHEME`     | WebAuthn scheme          | `http`                    |
| `ADMIN_USER`         | Password login user      | `none`                    |

`REGISTRATION_TOKEN` is required to register browser users; the first
user can register without it. `BROWSER_HOSTNAME` is the WebAuthn RP ID
(default: the server hostname). `BROWSER_SCHEME` is the scheme
advertised to passkeys (`http` or `https`, default `http`).
`ADMIN_USER` enables username/password login for the memory browser
as a fallback when WebAuthn is unavailable; the 8-character password
is generated at startup and printed to the log.

Every `store_memory` and `delete_memory` call writes the full memory
graph to disk immediately, so data survives container restarts. The
memory file lives at [`MEMORY_FILE_PATH`](#configuration)
(default `<DATA_DIR>/memory.jsonl`); mounting a volume at `DATA_DIR`
persists it across container replacement.

### Logging

The server logs to stdout (captured by `docker logs`). At `info` level
(default) it reports the memory restore summary at startup, each
`store_memory` / `delete_memory` write, and client session connect and
disconnect (session ID and client IP). Set `LOG_LEVEL=debug` to also log
each HTTP request (method, path, status, duration). Client IPs are
resolved from the `X-Forwarded-For` header when running behind a
reverse proxy.

### Logged events

| Event | Level | Details included |
| ----- | ----- | ---------------- |
| Memory restore at startup | info | counts and file path |
| Name pool restore at startup | info | available count, file path |
| Agent identity claimed | info | picked name, next variant |
| Memory write or delete | info | memory name, importance, source |
| MCP session connect / close | info | agent name, session ID, IP, transport |
| Agent name collision | warn | requested name, fallback |
| Cross-source delete attempt | error (`[CRIT]`) | agent name, target memory |
| Browser registration started | info | user name, role, IP |
| Browser registration rejected | warn | user name, reason, IP |
| Passkey registered | info | user name, IP |
| Passkey sign-in / sign-out | info | user name, IP |
| Passkey verification failure | warn | user ID, IP |
| Unknown login attempt | warn | requested name, IP |
| Password sign-in | info | user name, IP |
| Password login rejected | warn | requested name, IP |
| Protected memory tamper | error (`[CRIT]`) | memory name, attempt type |
| User deleted (superuser) | info | target, actor |
| Registration token changed | info | actor |
| HTTP request (debug only) | debug | method, path, status, duration |

## API Reference

The server provides the following MCP tools:

- `store_memory` - Store memories (optional `source`, batch mode)
- `update_memory` - Update an existing memory by name
- `retrieve_memory` - Retrieve a memory by name, optionally filtered by `source`
- `search_memories` - Search memories, optionally filtered by `source`
- `list_memories` - List all memories, optionally filtered by `source`
- `count_memories` - Count memories, optionally filtered by `source`
- `list_sources` - List all unique sources with memory counts
- `delete_memory` - Delete a memory (optional `source` guard)

## Contributing

Contributions are welcome!
Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

Licensed under the [MIT License](LICENSE).
Third-party components are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Further reading

This software builds on the **Blackboard architecture** and insights from
the study _[Generative Agents: Interactive Simulacra of Human Behavior_
(Park et al., 2023)](https://arxiv.org/html/2304.03442v2).

## Support

- [GitHub Issues](https://github.com/jiripech/s19y-mcp/issues)
- [GitHub Discussions](https://github.com/jiripech/s19y-mcp/discussions)

---

**Author:** RevoFab s.r.o.
