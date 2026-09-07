# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog][kac], and this project adheres to
[Semantic Versioning][semver].

## [Unreleased]

No unreleased changes yet.

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
[unreleased]: https://github.com/jiripech/s19y-mcp/compare/v0.11.1...HEAD
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
