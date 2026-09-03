# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog][kac], and this project adheres to
[Semantic Versioning][semver].

## [Unreleased]

No unreleased changes yet.

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
[unreleased]: https://github.com/jiripech/s19y-mcp/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/jiripech/s19y-mcp/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/jiripech/s19y-mcp/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/jiripech/s19y-mcp/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/jiripech/s19y-mcp/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/jiripech/s19y-mcp/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/jiripech/s19y-mcp/releases/tag/v0.1.0
