# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog][kac], and this project adheres to
[Semantic Versioning][semver].

## [Unreleased]

### Changed (Unreleased)

- Slimmed the runtime image: base is now `node:26.8.2-bookworm-slim`
  (de-pinned from the floating `node:current-bookworm` buildpack-deps
  base) with `curl ca-certificates libgomp1` added at runtime -
  `libgomp1` supplies OpenMP for the bundled llama-server. Only
  `llama-server` plus its `*.so*` libraries are copied from the
  builder stage, dropping the ~50 companion tools and test binaries.
  Image size and push/pull time drop substantially.

## [0.18.1] - 2026-09-12

### Added (0.18.1)

- Session IDs in the browser admin's "Recent sessions" list are shown
  in full as a click-to-copy badge instead of an 8-character
  abbreviation, so a specific client session (e.g. an opencode
  `ses_...` ID) can be found and copied directly.

## [0.18.0] - 2026-09-11

### Added (0.18.0)

- `get_session_id` opencode plugin (`.opencode/plugin/session-id.ts`)
  exposes the client session ID as an MCP tool so agents can anchor
  their shared-memory identity to a stable `ses_...` ID across
  compactions and `opencode -c` resumes
- `COMPRESSION_TIMEOUT_MS` makes the per-request compression timeout
  configurable (default 120000 ms). Slow hosts (bundled llama-server on
  a weak CPU) can now extend it instead of seeing every request abort
  against the fixed two-minute limit.
- `NGINX_DEBUG` (default `false`) controls nginx access logging: by
  default the access log goes to `DATA_DIR/nginx-access.log` so docker
  logs stay clean; set `NGINX_DEBUG=true` to stream it to `/dev/stdout`.
  `error_log` always stays on `/dev/stderr`.
- Log fencing on startup: `llama-server.log` and `nginx-access.log`
  are checked against `LOG_MAX_SIZE` (bare number = MiB, or a
  `B/K/M/G` suffix, default `100M`). Oversized logs are compressed to
  timestamped `.gz` archives in `DATA_DIR` and a fresh empty log is
  opened.
- `LOG_ADMIN` alerting: when a log fence trips, an e-mail is sent via
  `SMTP_SERVER`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD` with
  `MAIL_FROM` as the `From:` header, listing each log and its size. If
  `LOG_ADMIN` is unset or the mail cannot be sent, the memory browser
  shows a `⚠️` banner and the reason stays in the docker log.
- Transposed instruction headings in `DATA_DIR/info/agents.md` now use
  the full first line up to 78 chars (kept ≤80 for markdownlint)
  instead of the previous arbitrary 60-char cut.

## [0.17.0] - 2026-09-11

### Added (0.17.0)

- Agent ID badge now shows a clipboard icon with a tooltip containing
  the session codename, source IP, and transport protocol
- `list_available_names` MCP tool lets agents discover the next
  available name without polling the info page
- `GET /api/agent-pool` (auth) and `GET /api/agents` (superuser)
  browser admin endpoints for inspecting the name pool and identified
  agents
- Agent registry merges identity history when the same source is
  reused across sessions (preserves `firstSeen`, sums `connections`)
- `tests/info-routes.test.mjs` covers the full info routing contract
  including `.md` suffix compatibility

### Changed (0.17.0)

- Info page toggle renamed from "Source" to "Code" (class `md-source`
  → `md-code`) to better reflect its purpose
- Agent name pool decoupled from the memory graph: names are tracked
  exclusively in `DATA_DIR/names.txt` via atomic tmp+rename writes,
  eliminating the torn read-modify-write that could silently drop the
  `agent_names` entity from `memory.jsonl`
- Transposed p90+ instructions now write to `DATA_DIR/info/agents.md`
  (a real info page) instead of a separate `DATA_DIR/AGENTS.md` file;
  legacy paths are migrated automatically on startup
- Info routes normalize the `.md` suffix uniformly for all pages
  instead of relying on a hidden special-case for `agents.md`

### Fixed (0.17.0)

- `nextVariant` ordinal regex now correctly handles `Epictetus the
  2nd`, `Cicero the 3rd`, etc. (previously used a non-anchored
  alternation that could match stale suffixes)
- `GET /info/` (agent HTTP API) now lists the agents page alongside
  other info pages, making it visible to agents and the browser admin
  equally

### CI (0.17.0)

- `scripts/preview-server.sh` dev helper manages the local preview
  server lifecycle (start/stop/restart/status/verify) with pidfile
  tracking under `tmp/`

### Documentation (0.17.0)

- `info/agent-identity.md` rewritten to document the file-only pool
  and registry model
- `info/index.md`, `info/priorities.md`, `info/browser.md` updated
  to reference `DATA_DIR/info/agents.md`
- `README.md` info pages section rewritten; agent identity docs
  updated

## [0.16.1] - 2026-09-10

### Fixed (0.16.1)

- llama-server no longer crashes with SIGILL (exit 132, empty
  `llama-server.log`) on CPUs that lack AVX. With `GGML_NATIVE=OFF`
  the ggml CMake `INS_ENB` logic silently enables every `GGML_<ISA>`
  option, which compiles the whole x86 backend with global
  `-mavx2/-mfma/-mf16c/-mavx/-msse4.2/-mbmi2` flags; on the NAS vCPU
  (no AVX, no XSAVE) the first executed AVX instruction faults
  (`traps: llama-server trap invalid opcode ... in libggml-cpu.so`).
  The Dockerfile now disables all `GGML_<ISA>` options so the backend
  builds against the portable SSE2 baseline and runs on every x86-64
  CPU (generic kernels are used, so throughput on old CPUs is lower).

### CI (0.16.1)

- The Docker build now keeps its layer cache in the Docker Hub
  registry under a `buildcache` ref in addition to the ephemeral
  GitHub Actions cache, so pushed builds reuse the cached llama.cpp
  compile and npm layers and local builds can pull the same cache
  (see the decision record below)

### Decision: CI build caching (pros/cons)

Splitting the build into separate push-to-registry base images was
considered instead. Recorded so the trade-off is not re-litigated.

Problem: `docker/build-push-action` rebuilds the whole image on each
push; the dominant cost is the llama.cpp compile stage (two
platforms, under QEMU). npm `npm ci` and the nginx `apt-get` layer
add to it.

Option A - registry BuildKit cache (`type=registry`):

- Pros: one-line workflow change; caches **all** stages including the
  llama.cpp compile; per-architecture; usable by local `docker build
  --cache-from` too; nothing to keep in sync - the cache is just
  blobs under a `buildcache` tag.
- Cons: cache lives in the same Docker Hub image repo (a second tag);
  `cache-to` runs only on push builds (PRs keep gha cache, and a
  private repo would not allow anonymous cache pulls); large cache
  blobs add modest push/export time.

Option B - published deps base image (`s19y-mcp-deps`):

- Pros: deterministic digest-pinned artifact; survives cache eviction;
  local builds are fast after the first pull.
- Cons: needs a second Dockerfile, a second CI job with
  "rebuild on lockfile change" triggering, and a discipline rule so
  the deps image never goes stale; diverts attention from the
  dominant cost (llama compile), which the deps image would not
  cache.

Result: chose **Option A** - it captures the llama.cpp compile cache
(the real win) and helps local builds with a fraction of the
maintenance of Option B. Revisit Option B only if reproducibility or
cache-eviction resistance ever becomes a hard requirement.

## [0.16.0] - 2026-09-10

### Added (0.16.0)

- TLS is now terminated by a bundled nginx proxy instead of Node: nginx
  listens on the public `PORT` (default 3000) and proxies to the Node
  app on `APP_HOST:APP_PORT` (default `127.0.0.1:3001`), so the Node
  process no longer binds a public port directly
- When both `SSL_CERT_FILE` and `SSL_KEY_FILE` (unencrypted PEM,
  default `<DATA_DIR>/cert.pem` and `<DATA_DIR>/key.pem`) are present,
  nginx serves HTTPS on `PORT` and falls back to plain HTTP with a
  warning if the PEM pair is invalid; nginx runs with streaming proxy
  settings (`proxy_buffering off`, long timeouts) so MCP SSE and
  Streamable HTTP connections are not buffered

### Changed (0.16.0)

- llama.cpp is pinned to the stable `v0.4.0` release instead of a
  moving `master` checkout, so builds are reproducible; llama-server
  logs are line-buffered (`stdbuf`), so a crash point is visible in
  `llama-server.log` instead of a zero-byte file
- `server.mjs` no longer reads `ssl`-related PEM files itself; the
  `tls-options.mjs` module and its test were removed
- `AGENTS.md` and the README document the new port layout
  (`PORT` / `APP_PORT` / `APP_HOST`) and the nginx TLS topology

## [0.15.1] - 2026-09-09

### Changed (0.15.1)

- Corrupt or mismatched TLS certificate/key files no longer crash the
  server: the PEM files are validated at load time and `createHttpsServer`
  is wrapped so the server falls back to plain HTTP with a warning instead
  of entering a container restart loop
- The entrypoint reports why llama-server is not healthy when it exits
  early: instead of waiting blindly and printing a generic timeout, it
  detects a dead process, reports its exit code, and dumps the tail of
  `llama-server.log` (or notes the log is empty) so failures visible in
  the `docker logs` banner
- The token browser uses the `priority` attribute directly (0-100, default
  50) instead of the legacy 1-10 `importance` scale that was silently
  multiplied by 10; the editor now accepts the full 0-100 range and
  legacy `importance` observations still display correctly

### Fixed (0.15.1)

- Markdown and textareas in the token browser's `#/info` view now use a
  monospace font so aligned columns render correctly

## [0.15.0] - 2026-09-09

### Added (0.15.0)

- TLS on the server port: when `cert.pem` and `key.pem` (unencrypted
  PEM) are present in the data directory, the server serves HTTPS
  instead of plain HTTP; paths can be overridden with `SSL_CERT_FILE`
  and `SSL_KEY_FILE`
- Convenience `npm run` scripts for the local checks used before
  commits: `lint` (markdownlint), `lint:sh` (shellcheck), `lint:ci`
  (actionlint), `syntax` (node --check on all top-level modules), and
  `check` (all four in sequence)
- `llm.status` refresh watcher: while llama-server is still starting
  or after a failed start, the status file is re-checked against the
  health endpoint and flipped back to `ready` once it responds, so
  the browser banner recovers without a container restart
- Model download cleanup and retry: the model directory is created
  before downloading, failed downloads are retried
  `LLM_RETRIES` times with backoff, and the failure message states
  clearly that nothing retries later and a restart with a reachable
  URL is needed

### Changed (0.15.0)

- `API_KEY` is now optional: when unset (or left at the placeholder
  `change-to-your-api-key`), a random key is generated and printed to
  the startup log; the entrypoint no longer blocks waiting for a key
- Renamed LLM environment variables to keep them under 15
  characters: `LLM_MODEL_DOWNLOAD_RETRIES` → `LLM_RETRIES`,
  `LLM_HEALTH_TIMEOUT` → `LLM_TIMEOUT`, and
  `LLM_WATCH_INTERVAL_MS` → `LLM_WATCH_MS`
- Relative file-path environment variables (`LLM_MODEL_PATH`,
  `MEMORY_FILE_PATH`, `SSL_CERT_FILE`, `SSL_KEY_FILE`) now resolve
  against `DATA_DIR` when they do not begin with `/`
- The memory compressor announces itself as enabled only once its
  endpoint responds; startup logging was clarified to "configured"
  until then

### Fixed (0.15.0)

- Transposed `AGENTS.md` sections were invalid markdown: headings
  truncated mid-word, 80+-column unwrapped content, and an italic
  `_Author ..._` footer. Transposed sections now use a word-boundary
  heading, body wrapped at 80 columns, and a lint-clean
  `---`/`Author metadata` footer

## [0.14.1] - 2026-09-09

### Added (0.14.1)

- Agent registry: every connection is persisted in `<DATA_DIR>/
  agents.json` (session UUID, codename, transport, client IP, first
  and last seen, connection count) and restored at startup, so agent
  identities survive container replacements
- Claimed pool identities are stored on the registry record; a
  reconnecting session with a previously claimed identity is reminded
  of that name in its `identityNotice` instead of being offered a
  fresh pick

### Fixed (0.14.1)

- Browser showing `ERR_ADDRESS_UNREACHABLE` while the bundled LLM
  boots: the entrypoint previously started the LLM (model download +
  health wait) before launching Node, so port 3000 was silent during
  bootstrap. The LLM now starts in the background and the server
  serves immediately
- The browser now shows an LLM status banner (disabled, downloading,
  starting, ready, error) driven by a new public `GET /api/status`
  endpoint backed by `llm.status` markers written by the entrypoint
- Memory compressor spamming repeated warnings when the compression
  endpoint is not yet reachable: one warning per distinct failure
- Automatic transposition of priority 90+ memories into `AGENTS.md`
  crashed with `agentsFile is not a function`, so instructions were
  never transposed and memory updates could duplicate them: the file
  path is now used correctly and a marker in the file prevents double
  transposition

## [0.13.0] - 2026-09-08

### Added (0.13.0)

- `ADMIN_PASSWORD` environment variable: a fixed password that
  overrides the rotating one and never rotates
- Admin password is now a one-time password: persisted in
  `<DATA_DIR>/admin.password` so it survives restarts, and rotated to
  a fresh value (printed to the log) after each successful login

## [0.12.0] - 2026-09-07

### Added (0.12.0)

- Bundled language model: `llama-server` (llama.cpp, CPU) ships in
  the image and serves an OpenAI-compatible API on localhost; the
  Qwen2.5-3B GGUF model (about 2 GB) is downloaded to the data
  directory on first start, so no external model service or compose
  setup is needed (`LLM_ENABLED`, `LLM_MODEL_URL`, `LLM_MODEL_PATH`,
  `LLM_PORT`, `LLM_CONTEXT`, `LLM_THREADS`)
- Memory attributes: `u` (originating user), `p` (project), `exp`
  (UNIX expiry), `ttl` (input only, converted to `exp`), `cr`
  (compression requested, cannot be recalled) and server-managed
  `cs` (compression status)
- Priority replaces importance: range 0-100 with default 50; all
  stored `importance: N` (1-10) observations are migrated to
  `priority: N*10` at first startup
- Include/exclude record filters on `search_memories`,
  `list_memories` and `count_memories` with special keys
  `minPriority` and `tag`
- Memory compressor: a background job compresses memories requested
  with `cr: true` through an OpenAI-compatible endpoint (bundled
  llama-server by default, `COMPRESSION_ENDPOINT=none` to disable),
  stores the result as a `compressed:` observation next to the
  original, and flips `cs` to done
- Priority 90+ memories are treated as instructions: the server
  transposes them automatically into a server-owned `AGENTS.md`
  served at `/info/agents.md` (API key required)
- `/info` markdown pages: seeded into the data directory at first
  start, readable by agents via API-key endpoints and by humans in
  the memory browser (view with client-side search); superuser can
  create, edit and delete pages in the browser admin area
- Memory browser shows priority buckets (0-32/33-66/67-89/90+),
  user and project chips, an Expired badge for memories past their
  `exp`, and the new Info view

## [0.11.2] - 2026-09-07

### Fixed (0.11.2)

- Browser assets are served network-first instead of
  stale-while-revalidate, so after every deploy the first visit shows
  the new UI instead of the previous release's files until a second
  reload
- The page reloads itself when a new service worker takes control,
  closing the stale first-paint window completely

## [0.11.1] - 2026-09-05

### Fixed (0.11.1)

- Login and register pages: the secure-context warning is now inside
  the auth card below the input fields instead of a full-width block
  rendered next to the card
- Memory browser source filter now matches parsed attributions, so
  filtering by **System** and **Unclaimed** works instead of always
  showing "No matches"

## [0.11.0] - 2026-09-05

### Added (0.11.0)

- Identity enforcement: every tool response from a session without a
  stable identity carries an `identityNotice` telling the agent to
  pick a name from `agent_names`, introduce it to its user, and use
  it as `source`; sessions with an `X-Agent-Name` header or a first
  `source` attribution are exempt
- Server `instructions` now state the requirement imperatively
  (establish a permanent identity before the first memory write)
- `GET /session` reports whether the session is identified
- `rw` flag on memories returned by `retrieve_memory`,
  `list_memories`, and `search_memories`: `1` when the memory's
  source matches the session's claimed identity, `0` otherwise
  (advisory only, explained in the server instructions);
  `retrieve_memory` gained an optional `source` filter (mismatch
  returns not found), helping agents conserve context
- Memory browser attributes unclaimed memories (no source) to
  **Unclaimed** instead of showing no owner
- Memory browser displays the `agent_names` system memory as
  "Available agent names (N)" owned by **System** and hides its
  Edit/Delete buttons (the server already rejected modifications)

## [0.10.0] - 2026-09-05

### Added (0.10.0)

- Optional username/password browser login as a fallback when
  WebAuthn is unavailable (plain HTTP without a secure context):
  set `ADMIN_USER` and the server generates an 8-character
  `[a-z0-9]` password at startup and logs it (regenerated on every
  restart); the password account has superuser rights; comparison
  is timing-safe
- Document previously undocumented log events in the README
  (name pool restore, agent identity claims, password login,
  protected memory tamper)

## [0.9.1] - 2026-09-05

### Fixed (0.9.1)

- Browser users are no longer created before the passkey exists: a
  failed or abandoned WebAuthn ceremony previously left a stub user
  that blocked the name (`User name already taken`) and made sign-in
  impossible (`No passkey registered for this user`); registration
  now only persists the user once the passkey verifies, re-registering
  over leftover stubs is allowed, and failed first-user attempts are
  cleaned up
- The login and register pages warn up front when the browser blocks
  WebAuthn because the page is not a secure context (plain HTTP on a
  non-localhost origin), instead of failing with a confusing
  `Cannot read properties of undefined` error
- Async route handlers can no longer crash the whole server on an
  unexpected error: browser routes and the legacy SSE endpoints are
  wrapped and unexpected errors are answered with HTTP 500

### Added (0.9.1)

- README documents the HTTPS (secure context) requirement for
  passkeys, including reverse proxy and localhost tunnel options

## [0.9.0] - 2026-09-04

### Added (0.9.0)

- Agent self-identification: the server maintains a shared,
  server-managed memory `agent_names` listing available names (Roman
  philosophers), seeded from `names.txt` in the data directory; agents
  without a stable `X-Agent-Name` header pick a name from it,
  introduce themselves to their user, and use it as `source` on
  `store_memory` / `update_memory`; picking a name marks it taken and
  rotates in the next ordinal variant ("the 2nd", "the 3rd", ...)
  keeping the list always current
- The `agent_names` memory can only be updated by the server; MCP
  `update_memory` / `delete_memory` and the browser superuser UI
  reject modifications and log `[CRIT]`
- Browser auth events are now logged: registration start, passkey
  creation, sign-in, sign-out, and all rejection reasons
- Document all logged events in a README subsection
- Server `instructions` explain the self-identification flow to
  agents

### Fixed (0.9.0)

- Registration token: the `REGISTRATION_TOKEN` environment variable
  was ignored (a random token from `users.json` was expected instead),
  so registration with the configured token failed with `Invalid
  registration token`; the environment variable now takes precedence,
  and the superuser UI change is rejected while it is set
- Browser service worker cache name is baked from the build tag
  (`s19y-browser-<tag>`) so every release invalidates the frontend
  cache automatically; local builds fall back to `dev`
- Session setup race under parallel MCP calls: the session was
  registered only after the initialize response completed, so
  concurrent follow-ups could get `Session not found` (404) and hit a
  fresh transport reporting `Server not initialized`; the session is
  now registered the moment the session ID is generated, and headerless
  POSTs that are not initialize requests are rejected without creating
  an orphan transport

## [0.8.2] - 2026-09-04

### Fixed (0.8.2)

- "Register" and "Sign in" links in the memory browser were rendered
  as plain text (arguments dropped by a UI helper), making account
  creation impossible; both links now render correctly
- Bump the browser service worker cache version so deployed clients
  pick up the fixed app on the next visit

## [0.8.1] - 2026-09-04

### Fixed (0.8.1)

- Suppress Node.js `ExperimentalWarning` noise at startup (Web Crypto
  API used by the WebAuthn library) via `NODE_OPTIONS` in the image
  and matching flags in the npm scripts

## [0.8.0] - 2026-09-04

### Added (0.8.0)

- Optional `X-Agent-Name` request header lets a client choose its own
  agent name instead of receiving a random codename; the server falls
  back to a random codename when the requested name is already in use
- Server `instructions` in the MCP `initialize` response, telling
  agents about the shared pool, session codenames, and the
  `X-Agent-Name` header

## [0.7.0] - 2026-09-03

### Added (0.7.0)

- Memory browser PWA at `/browser.app` (vanilla JS, Liquid Glass UI)
- WebAuthn/FIDO2 passkey registration and login: the first user
  becomes superuser, further registration is gated by the
  `REGISTRATION_TOKEN` environment variable
- Superuser management in the browser: list and delete users, change
  the registration token, and create, edit, or delete any memory
- `REGISTRATION_TOKEN`, `BROWSER_HOSTNAME`, and `BROWSER_SCHEME`
  environment variables

### Changed (0.7.0)

- Users and WebAuthn credentials are stored in `/app/data/users.json`

### Fixed (0.7.0)

- Requests with an unknown session ID now return HTTP 404
  (`Session not found`) instead of 400, so spec-compliant clients
  re-initialize automatically after a server restart
- Session codenames are released back to the pool when a session
  closes instead of leaking

## [0.6.0] - 2026-09-03

### Added (0.6.0)

- Agent name assignment: each MCP session gets a random codename
  (e.g. "Agent Fox") shown in connect and disconnect logs
- `GET /session` endpoint to discover the agent name of a session

## [0.5.0] - 2026-09-03

### Added (0.5.0)

- Batch mode for `store_memory` via a `memories` array argument
- `update_memory` tool to update content, tags, source, and
  importance of an existing memory
- `count_memories` tool with optional `source` filter
- `list_sources` tool listing unique sources with memory counts
- Deletion guard on `delete_memory`: optional `source` argument
  blocks cross-source deletions and logs them with `[CRIT]`

## [0.4.0] - 2026-09-02

### Added (0.4.0)

- Streamable HTTP transport on `/mcp` endpoint (MCP spec 2025-03-26)
- Session resumability and `Mcp-Session-Id` header support
- Both transports coexist: legacy SSE on `/sse` and Streamable HTTP
  on `/mcp` — clients can use either endpoint

### Changed (0.4.0)

- Express JSON body parser enabled for Streamable HTTP requests
- Session logging now includes transport type (SSE or Streamable HTTP)

## [0.3.0] - 2026-09-02

### Added (0.3.0)

- Startup logging: number of memories and relations restored from the
  memory file, and the resolved file path
- Write logging on `store_memory` and `delete_memory`
- Session logging: new client connections show session ID and client IP,
  disconnects report the active session count
- Optional `LOG_LEVEL` environment variable (`debug` for per-request
  logging, default `info`)

### Changed (0.3.0)

- Memory graph is now loaded once at startup and shared across client
  sessions instead of being reloaded per connection
- Trust proxy headers so client IPs are correct when behind a reverse
  proxy

## [0.2.0] - 2026-09-02

### Added (0.2.0)

- Optional `source` parameter on `store_memory` attributes a memory
  to a specific agent
- Optional `source` filter on `search_memories` and `list_memories`
  narrows results to a single contributing agent
- Document the shared-pool attribution model in `README.md`

## [0.1.2] - 2026-09-01

### Fixed (0.1.2)

- Persist memories to `DATA_DIR` (default `/app/data`) instead of the
  ephemeral `node_modules` path, so data survives container replacement
- Create the data directory on startup when it does not yet exist

### Changed (0.1.2)

- Standard users now install via `docker pull`; building from source is
  a separate development path
- Document opencode `shared-memory_*` tool permissions and the `remote`
  MCP client type

### Added (0.1.2)

- Memory file location configurable via `MEMORY_FILE_PATH`, defaulting
  to `<DATA_DIR>/memory.jsonl`

## [0.1.1] - 2026-09-01

### Security

- Patch base image packages on build (fixes OpenSSL CVE-2026-14456)
- Remove the bundled npm CLI from the runtime image to drop unused
  vulnerable packages (brace-expansion, tar, ip-address)

### Fixed

- Copy `memory-server.mjs` into the image so the server starts
  (was `ERR_MODULE_NOT_FOUND` at startup)
- Pin `ip-address` to 10.7.0 via overrides (fixes SSRF CVE-2026-69192)
- Install dependencies from `package-lock.json` for reproducible builds

### Changed

- License changed to MIT (see `LICENSE` and `THIRD_PARTY_NOTICES.md`)

### Added

- Dockerfile completeness tests that assert all local modules imported
  by the server are copied into the image

## [0.1.0] - 2026-09-01

Initial release of the S19y MCP Server with the following features:

- Knowledge graph memory server over MCP (SSE) with API key auth
- Docker image with entrypoint that validates `API_KEY` at startup
- Multi-architecture Docker builds (linux/amd64, linux/arm64)
- CI workflow for Docker build and push to Docker Hub

[kac]: https://keepachangelog.com/en/1.1.0/
[semver]: https://semver.org/spec/v2.0.0.html
[0.18.1]: https://github.com/jiripech/s19y-mcp/compare/v0.18.0...v0.18.1

[0.18.0]: https://github.com/jiripech/s19y-mcp/compare/v0.17.0...v0.18.0
[0.17.0]: https://github.com/jiripech/s19y-mcp/compare/v0.16.1...v0.17.0
[0.16.1]: https://github.com/jiripech/s19y-mcp/compare/v0.16.0...v0.16.1
[0.16.0]: https://github.com/jiripech/s19y-mcp/compare/v0.15.1...v0.16.0
[0.15.1]: https://github.com/jiripech/s19y-mcp/compare/v0.15.0...v0.15.1
[0.15.0]: https://github.com/jiripech/s19y-mcp/compare/v0.14.1...v0.15.0
[0.14.1]: https://github.com/jiripech/s19y-mcp/compare/v0.13.0...v0.14.1
[0.13.0]: https://github.com/jiripech/s19y-mcp/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/jiripech/s19y-mcp/compare/v0.11.2...v0.12.0
[0.11.2]: https://github.com/jiripech/s19y-mcp/compare/v0.11.1...v0.11.2
[0.11.1]: https://github.com/jiripech/s19y-mcp/compare/v0.11.0...v0.11.1
[0.11.0]: https://github.com/jiripech/s19y-mcp/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/jiripech/s19y-mcp/compare/v0.9.1...v0.10.0
[0.9.1]: https://github.com/jiripech/s19y-mcp/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/jiripech/s19y-mcp/compare/v0.8.2...v0.9.0
[0.8.2]: https://github.com/jiripech/s19y-mcp/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/jiripech/s19y-mcp/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/jiripech/s19y-mcp/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/jiripech/s19y-mcp/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/jiripech/s19y-mcp/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/jiripech/s19y-mcp/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/jiripech/s19y-mcp/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/jiripech/s19y-mcp/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/jiripech/s19y-mcp/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/jiripech/s19y-mcp/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/jiripech/s19y-mcp/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/jiripech/s19y-mcp/releases/tag/v0.1.0
