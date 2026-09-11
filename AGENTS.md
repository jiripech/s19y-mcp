# AGENTS.md

Instructions for AI agents working on this repository.

## Project Overview

S19y MCP Server is a Model Context Protocol (MCP) server providing
self-reflexion memory capabilities for AI agents.
Built with Node.js and Express.

## Build & Run

```bash
# Install dependencies
npm install

# Development (with auto-reload)
npm run dev

# Production
npm start

# Docker
docker build -t s19y-mcp .
docker run -p 3000:3000 -e API_KEY=your-key s19y-mcp

# Docker Compose
API_KEY=your-key docker compose up
```

## Code Conventions

- **Module system**:
  ES Modules (`import`/`export`), use `.mjs` extension
- **Style**:
  No semicolons (match existing code in server.mjs)
- **Language**:
  All comments and strings in English
- **Variables**:
  Use `const` by default, `let` only when reassignment needed
- **Error handling**:
  Return JSON error responses with appropriate HTTP status codes

## Standard operations

1. Focus on development efficiency.
2. Adhere to KISS/DRY, SOLID and clean code principles.
3. Avoid denied tools/commands.
4. Always delegate keeping notes from lessons learned in parallel
   before executing a long running task like tests.
5. Strictly use allowed tools/commands without chaining with '&&', '|', '||', etc.

## Project Structure

```text
s19y-mcp/
├── server.mjs          # Main MCP server entry point
├── entrypoint.sh       # Container startup: generates API_KEY if missing
├── package.json        # Node.js dependencies and scripts
├── Dockerfile          # Container build instructions
├── docker-compose.yml  # Multi-container orchestration
├── scripts/            # Utility scripts
├── tests/              # Test files
├── LICENSE             # MIT license
├── THIRD_PARTY_NOTICES.md  # Third-party component licenses
├── .github/workflows/  # CI workflows
└── tmp/                # Temporary files (git-ignored)
```

## Adding MCP Tools

To add a new MCP tool:

1. Follow the pattern in `@modelcontextprotocol/server-memory`
2. Register tools using the MCP SDK's tool registration API
3. Test with an MCP client (e.g., opencode with SSE transport)

## Git Workflow

- Commit messages: Use clear, descriptive messages,
  [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/)
  if possible
  - Example: `feat: Add user authentication middleware`
  - Example: `fix: Improve session cleanup on disconnect`
- Branch naming: `feature/description` or `fix/description`
- Keep commits focused - one logical change per commit

## Testing

- Run tests with: `npm test`
- Place test files in `tests/` directory
- Test both successful operations and error cases

## CI / Docker

The CI workflow is defined in `.github/workflows/docker-build-push.yml`.
It builds a multi-arch image (linux/amd64, linux/arm64) on push to
`main` and on version tags, and pushes to Docker Hub. Pull requests
build without pushing. Layer cache is exported to a `buildcache` tag
in the same Docker Hub repository on push builds (pulled by CI and by
local `docker build --cache-from`); PRs use only the ephemeral GitHub
Actions cache. See the decision record under `[Unreleased]` in
`CHANGELOG.md`.

- Validate the workflow with:
  `actionlint .github/workflows/docker-build-push.yml`
- GitHub Actions **variables** (set in repo settings):
  - `DOCKER_NAMESPACE`: Docker Hub namespace (e.g. `hqcz`)
- GitHub Actions **secrets** (set in repo settings):
  - `DOCKER_USERNAME`: Docker Hub username
  - `DOCKER_TOKEN`: Docker Hub access token

**Caveat:** the Docker Hub repository must have **tag immutability
disabled** (default). Versioned releases push both `<version>` and
`latest` tags to the same manifest; if immutability is enabled, the
existing `latest` tag cannot be re-pointed and the push fails with
`denied: ... cannot be updated due to immutability settings`. Keep
tags mutable for `latest` to track releases.

## Releases / Versioning

- Keep `CHANGELOG.md` up to date and in [Keep a Changelog][kac] format.
- Adhere to [Semantic Versioning][semver]: version = `major.minor.patch`.
- Before suggesting a release version, read `CHANGELOG.md` to find the
  **last released version** and bump it by one patch/minor/major - never
  skip numbers or invent a version. Also keep `package.json`,
  `memory-server.mjs` server version, and the git tag in sync.
- To release: cut the version tag (e.g. `v0.1.2`) and push; CI builds the
  multi-arch image and pushes to Docker Hub.

[kac]: https://keepachangelog.com/en/1.1.0/
[semver]: https://semver.org/spec/v2.0.0.html

## Environment Variables

| Variable                  | Description                | Default             |
| ------------------------- | -------------------------- | ------------------- |
| `API_KEY`                 | MCP client auth key        | generated           |
| `PORT`                    | Public port (nginx)        | 3000                |
| `APP_PORT`                | Internal app port          | 3001                |
| `APP_HOST`                | Internal app host          | 127.0.0.1           |
| `DATA_DIR`                | Data storage directory     | /app/data           |
| `REGISTRATION_TOKEN`      | Browser registration token | none                |
| `BROWSER_HOSTNAME`        | WebAuthn RP ID             | hostname            |
| `BROWSER_SCHEME`          | WebAuthn scheme            | http                |
| `ADMIN_USER`              | Password login user        | none                |
| `ADMIN_PASSWORD`          | Static admin password      | none (OTP)          |
| `COMPRESSION_ENDPOINT`    | Compression endpoint       | bundled             |
| `COMPRESSION_MODEL`       | Compression model          | qwen2.5-3b-instruct |
| `COMPRESSION_INTERVAL_MS` | Tick interval (ms)         | 60000               |
| `LLM_ENABLED`             | Bundled llama-server       | true                |
| `LLM_MODEL_URL`           | GGUF download URL          | Qwen2.5-3B (HF)     |
| `LLM_MODEL_PATH`          | GGUF file location         | model.gguf          |
| `LLM_RETRIES`             | Model download retries     | 3                   |
| `LLM_TIMEOUT`             | Health wait (s)            | 120                 |
| `LLM_PORT`                | llama-server port          | 8080                |
| `LLM_CONTEXT`             | llama-server context       | 4096                |
| `LLM_THREADS`             | llama-server threads       | 4                   |
| `LLM_WATCH_MS`            | llm.status refresh (ms)    | 30000               |
| `SSL_CERT_FILE`           | TLS cert PEM path          | cert.pem            |
| `SSL_KEY_FILE`            | TLS key PEM path           | key.pem             |

`API_KEY` authenticates MCP clients; when unset (or left at the
placeholder `change-to-your-api-key`), a random key is generated and
printed to the log at startup. Relative file-path environment
variables (`LLM_MODEL_PATH`, `MEMORY_FILE_PATH`, `SSL_CERT_FILE`,
`SSL_KEY_FILE`) resolve against `DATA_DIR` when they do not begin
with `/`. The bundled LLM download is retried `LLM_RETRIES` times;
the server waits up to `LLM_TIMEOUT` seconds for llama-server and
refreshes `llm.status` every `LLM_WATCH_MS` ms so the banner recovers
to `ready` once the endpoint responds.

TLS is terminated by the bundled nginx, not Node itself: nginx
listens on the public `PORT` and proxies to the Node app on
`APP_HOST:APP_PORT` (loopback). When both `SSL_CERT_FILE` and
`SSL_KEY_FILE` (unencrypted PEM) are present, nginx serves HTTPS on
`PORT`; otherwise it serves plain HTTP. A valid TLS setup requires
`BROWSER_SCHEME=https` and `BROWSER_HOSTNAME` matching the public
hostname for WebAuthn. nginx runs with streaming proxy settings
(`proxy_buffering off`, long timeouts) so MCP SSE/Streamable HTTP
connections are not buffered.

## Markdown Rules

When editing markdown files, follow these rules:

- Run `npx markdownlint-cli *.md` before committing
- All markdown must pass with default settings
- Keep lines under 80 characters
- Use proper fenced code block language specifiers
- Follow MD060 table column style (consistent in the whole project)

## Shell Script Rules

When editing shell scripts, follow these rules:

- Run `shellcheck -x scripts/*.sh` before committing
- All scripts must pass with no warnings
- Use `shellcheck source=.env` directive for `.env` sourcing

## Session Lessons

Hard-won lessons from prior agent sessions. Read this before running
commands.

- macOS has no `timeout` command (GNU coreutils). Use the Bash tool's
  own timeout parameter instead; `timeout 90 npm test` fails.
- `npm test` (the full suite) hangs after passing as a pre-existing
  side effect (some KG stdio child process keeps the event loop alive).
  Run individual test files instead, e.g.
  `npx node --test tests/browser-routes.test.mjs`.
- When running background/parallel commands that produce output, always
  write logs into the repo's `./tmp/` directory, never `/tmp/...`
  (e.g. `mkdir -p tmp/test-logs && ... >
  tmp/test-logs/browser-test.log 2>&1 &`). The user insists temp work
  stays under `./tmp`, and `/tmp` logs are read-restricted here.
- Read generated log files with the Read tool, but the Read tool is
  also permission-restricted for `/tmp` paths — another reason to keep
  logs in `./tmp`.
- The permission config denies `sleep *` except exactly `sleep 5`.
  Don't write arbitrary `sleep 8` in bash; rely on the tool timeout or
  `sleep 5`.
- On resume, recover your shared-memory identity by session ID: call
  `get_session_id` (plugin in `.opencode/plugin/`), then search the
  memory server for a tagged `identity-anchor` record mapping that
  `ses_...` ID to a `source`. Do not trust compaction summaries for
  identity - only the anchor record on the server is authoritative.
