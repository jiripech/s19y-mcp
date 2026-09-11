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
- Set `API_KEY` to the key your MCP clients will authenticate with. If omitted
  (or left at the placeholder `change-to-your-api-key`), a random key is
  generated and printed to the server log at startup.
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

| Tool              | Description                                          |
| ----------------- | ---------------------------------------------------- |
| `store_memory`    | Store memories (batch, priority, attributes)         |
| `update_memory`   | Update an existing memory (all attributes)           |
| `retrieve_memory` | Retrieve a memory by name (optional `source` filter) |
| `search_memories` | Search memories (source and include/exclude filters) |
| `list_memories`   | List memories (source and include/exclude filters)   |
| `count_memories`  | Count memories (source and include/exclude filters)  |
| `list_sources`    | List all unique sources with memory counts           |
| `delete_memory`   | Delete a memory (optional `source` guard)            |

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
belongs to another identity or an unclaimed author.
Memories without any source are attributed to **Unclaimed** in the
memory browser.

### Memory attributes

Beyond `source`, memories may carry structured attributes passed to
`store_memory` / `update_memory`:

- `priority` (0-100, default 50) replaces the old 1-10 importance;
  existing memories are migrated automatically at first startup
  (N -> N*10)
- `u` - originating user (`$USER` of the system that stored it)
- `p` - originating project (directory or repository name)
- `exp` - UNIX expiry timestamp; `ttl` (seconds) is converted to
  `exp` on input and never stored
- `cr` - compression requested (cannot be recalled); `cs` is the
  server-managed status (0 pending, 1 done)

`search_memories`, `list_memories` and `count_memories` accept
`include` / `exclude` filter objects with any attribute key plus the
special `minPriority` and `tag` keys:

```json
{
  "include": { "u": "jiri.pech", "minPriority": 91 },
  "exclude": { "p": "s19y-mcp" }
}
```

Include requires all keys to match; exclude drops any match.

### Memory compressor

The image bundles `llama-server` (llama.cpp) and enables the
compressor out of the box: on first start the model file (Qwen2.5-3B
Instruct, 4-bit GGUF, about 2 GB) is downloaded into the data
directory and served locally. When `COMPRESSION_ENDPOINT` and
`COMPRESSION_MODEL` are set, a background job compresses memories
requested with `cr: true` through any OpenAI-compatible endpoint:
same meaning, far fewer tokens. The compressed text is stored as a
`compressed:` observation next to the original (kept as a safety
net) and the `cs` flag flips from pending to done. Failures are
logged and retried on the next tick (default 60s,
`COMPRESSION_INTERVAL_MS`).

To run without the bundled model (for example on a RAM-constrained
host), set `LLM_ENABLED=false` and point `COMPRESSION_ENDPOINT` at
an external OpenAI-compatible API, or set `COMPRESSION_ENDPOINT=none`
to disable compression entirely.

### Info pages and server instructions

The server serves markdown info pages:

- Humans: the `#/info` view in the memory browser (searchable);
  the superuser edits pages in the admin area
- Agents: `GET /info/` (list) and `GET /info/<name>` (an optional
  `.md` suffix is accepted) with the `X-API-Key` header

Pages live in `<DATA_DIR>/info/` and are seeded on first start.
Memories with priority 90+ are treated as instructions: the server
transposes them into the `agents` page as soon as they are stored.
The page is listed in the browser (visible to every signed-in user
and editable by the superuser) and served to agents at
`/info/agents`, so instructions can be loaded at session start
without extra tool calls.

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
themselves: the server exposes a `list_available_names` MCP tool that
returns the current pool contents (Roman philosophers). An agent
calls it, chooses the first available name, introduces itself to its
user with that name, and passes it as `source` on every `store_memory`
and `update_memory` call. When the server sees a `source` matching an
available name it marks it taken and rotates in the next ordinal
variant ("Cicero" becomes "Cicero the 2nd", and so on), so the list
always reflects what is still available.

To make the requirement stick, the server appends an
`identityNotice` to every tool response of an unidentified session
(reminding the agent to pick a name and introduce itself to its
user) until the agent either arrives with an `X-Agent-Name` header
or uses a `source` attribution for the first time.
`GET /session` reports the current state via its `identified` field.

The available-name list is persisted in `names.txt` inside the data
directory (seeded on first start) and restored from there on startup.
The pool is entirely file-based and lives outside the memory graph,
so memory writes cannot interfere with it.

Every connection is recorded in `agents.json` inside the data
directory: the session UUID, the assigned codename, the transport and
client IP, and the first and last seen timestamps. When a session
claims a pool identity (uses a name as `source`), the claim is stored
on the same record, so identity survives container replacements. A
session that reconnects without a stable `X-Agent-Name` header but
with a previously claimed identity is reminded of that name by its
`identityNotice` instead of being offered a fresh pick.

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

- Use the bundled nginx TLS: drop `cert.pem` and `key.pem` into
  `<DATA_DIR>` (or override `SSL_CERT_FILE`/`SSL_KEY_FILE`), set
  `BROWSER_SCHEME=https` and `BROWSER_HOSTNAME` to the public
  hostname, and access the browser through the HTTPS hostname so
  WebAuthn origin verification matches
- For quick local testing, forward the port to your workstation
  (`ssh -L 12300:localhost:12300 <host>`) and open
  `http://localhost:12300/browser.app/` with `BROWSER_HOSTNAME=localhost`
- Skip passkeys entirely: set `ADMIN_USER` and sign in on the login
  page with that username and the 8-character one-time password
  printed in the server log (single account, superuser rights,
  intended for trusted networks). The password is persisted in
  `<DATA_DIR>/admin.password` and rotates to a new one after each
  successful login; set `ADMIN_PASSWORD` instead to force a fixed
  password that never rotates

## Configuration

| Variable                  | Description           | Default                   |
| ------------------------- | --------------------- | ------------------------- |
| `PORT`                    | Public port (nginx)   | `3000`                    |
| `APP_PORT`                | Internal app port     | `3001`                    |
| `APP_HOST`                | Internal app host     | `127.0.0.1`               |
| `API_KEY`                 | MCP client auth key   | generated                 |
| `DATA_DIR`                | Data directory        | `/app/data`               |
| `MEMORY_FILE_PATH`        | Memory file location  | `<DATA_DIR>/memory.jsonl` |
| `LOG_LEVEL`               | Log level             | `info`                    |
| `NODE_ENV`                | Environment           | `development`             |
| `REGISTRATION_TOKEN`      | Registration token    | `none`                    |
| `BROWSER_HOSTNAME`        | WebAuthn RP ID        | server hostname           |
| `BROWSER_SCHEME`          | WebAuthn scheme       | `http`                    |
| `ADMIN_USER`              | Password login user   | `none`                    |
| `ADMIN_PASSWORD`          | Static admin password | `none` (rotating OTP)     |
| `COMPRESSION_ENDPOINT`    | Compression endpoint  | bundled (`127.0.0.1`)     |
| `COMPRESSION_MODEL`       | Compression model     | `qwen2.5-3b-instruct`     |
| `COMPRESSION_INTERVAL_MS` | Tick interval (ms)    | `60000`                   |
| `COMPRESSION_TIMEOUT_MS`  | Request timeout (ms)  | `120000`                  |
| `NGINX_DEBUG`             | nginx access log      | `false`                   |
| `LLM_ENABLED`             | Bundled model on/off  | `true`                    |
| `LLM_MODEL_URL`           | GGUF download URL     | Qwen2.5-3B (HF)           |
| `LLM_MODEL_PATH`          | GGUF file location    | `<DATA_DIR>/model.gguf`   |
| `LLM_RETRIES`             | Download retries      | `3`                       |
| `LLM_TIMEOUT`             | Health wait (s)       | `120`                     |
| `LLM_PORT`                | llama-server port     | `8080`                    |
| `LLM_CONTEXT`             | llama-server context  | `4096`                    |
| `LLM_THREADS`             | llama-server threads  | `4`                       |
| `LLM_WATCH_MS`            | Status refresh (ms)   | `30000`                   |
| `SSL_CERT_FILE`           | Path to TLS cert PEM  | `<DATA_DIR>/cert.pem`     |
| `SSL_KEY_FILE`            | Path to TLS key PEM   | `<DATA_DIR>/key.pem`      |

`REGISTRATION_TOKEN` is required to register browser users; the first
user can register without it. `BROWSER_HOSTNAME` is the WebAuthn RP ID
(default: the server hostname). `BROWSER_SCHEME` is the scheme
advertised to passkeys (`http` or `https`, default `http`).
`ADMIN_USER` enables username/password login for the memory browser
as a fallback when WebAuthn is unavailable; an 8-character one-time
password is generated, persisted in `<DATA_DIR>/admin.password`, and
rotated (with a new password printed to the log) after each
successful login. Setting `ADMIN_PASSWORD` disables rotation and uses
that fixed password instead. `API_KEY` authenticates MCP clients; when
unset (or left at the placeholder `change-to-your-api-key`), a random
key is generated and printed to the server log at startup. The memory
compressor defaults to the bundled llama-server (see
[Memory compressor](#memory-compressor)); `COMPRESSION_ENDPOINT=none`
disables it, and any OpenAI-compatible URL can replace it.

TLS is terminated by the bundled nginx proxy, not by Node. nginx
listens on the public `PORT` and proxies to the Node app on
`APP_HOST:APP_PORT` (loopback). When both a certificate and its key
(unencrypted PEM) are present at `<DATA_DIR>/cert.pem` and
`<DATA_DIR>/key.pem`, nginx serves HTTPS on `PORT`; otherwise it
serves plain HTTP. Override the paths with `SSL_CERT_FILE` and
`SSL_KEY_FILE`. The certificate can be self-signed or issued by a
trusted CA (e.g. mkcert for a LAN hostname) - clients must trust it.
When serving TLS, point the MCP endpoint URL and any WebAuthn
`BROWSER_SCHEME` at `https`, and set `BROWSER_HOSTNAME` to the public
hostname so WebAuthn origin verification matches.

Environment variables that name file paths (`LLM_MODEL_PATH`,
`MEMORY_FILE_PATH`, `SSL_CERT_FILE`, `SSL_KEY_FILE`) resolve relative
paths against `DATA_DIR`: a value without a leading `/` such as
`LLM_MODEL_PATH=Qwen/model.gguf` means `<DATA_DIR>/Qwen/model.gguf`.

The bundled model is downloaded on first start and retried up to
`LLM_RETRIES` times (backoff between attempts). The server waits up to
`LLM_TIMEOUT` seconds for llama-server to report healthy before
serving the memory endpoint without it; the `llm.status` banner is
then refreshed every `LLM_WATCH_MS` milliseconds so it recovers to
`ready` once llama-server responds.

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

| Event                     | Level          | Details included                |
| ------------------------- | -------------- | ------------------------------- |
| Memory restore            | info           | counts, file path               |
| Name pool restore         | info           | count, file path                |
| Agent registry restore    | info           | sessions, identified, file path |
| Agent identity claimed    | info           | picked name, next variant       |
| Memory write or delete    | info           | name, importance, source        |
| Session connect / close   | info           | name, session ID, IP, transport |
| Agent name collision      | warn           | requested name, fallback        |
| Cross-source delete       | error `[CRIT]` | agent name, target memory       |
| Registration started      | info           | user name, role, IP             |
| Registration rejected     | warn           | user name, reason, IP           |
| Passkey registered        | info           | user name, IP                   |
| Passkey sign-in / out     | info           | user name, IP                   |
| Verification failure      | warn           | user ID, IP                     |
| Unknown login attempt     | warn           | requested name, IP              |
| Password sign-in          | info           | user name, IP                   |
| Password login rejected   | warn           | requested name, IP              |
| Protected memory tamper   | error `[CRIT]` | memory name, attempt type       |
| User deleted (superuser)  | info           | target, actor                   |
| Token changed             | info           | actor                           |
| HTTP request (debug only) | debug          | method, path, status, ms        |

## API Reference

The server provides the following MCP tools:

- `store_memory` - Store memories; supports batch `memories`,
  `priority` (0-100), `u`, `p`, `exp`/`ttl`, `cr`
- `update_memory` - Update an existing memory, all attributes
  mergeable
- `retrieve_memory` - Retrieve a memory by name, optionally filtered by `source`
- `search_memories` - Search memories, `source` and
  include/exclude filters
- `list_memories` - List memories, `source` and include/exclude filters
- `count_memories` - Count memories, `source` and include/exclude filters
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
