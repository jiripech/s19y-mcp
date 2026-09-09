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

## Project Structure

```text
s19y-mcp/
├── server.mjs          # Main MCP server entry point
├── entrypoint.sh       # Container startup: validates API_KEY
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
build without pushing.

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

| Variable                  | Required | Description                          |
| ------------------------- | -------- | ------------------------------------ |
| `PORT`                    | No       | Server port (default: 3000)          |
| `API_KEY`                 | Yes      | Authentication key for MCP clients   |
| `DATA_DIR`                | No       | Data storage directory (/app/data)   |
| `REGISTRATION_TOKEN`      | No       | Registration token for browser users |
| `BROWSER_HOSTNAME`        | No       | WebAuthn RP ID (default: hostname)   |
| `BROWSER_SCHEME`          | No       | WebAuthn scheme (http/https)         |
| `ADMIN_USER`              | No       | Password login user for the browser  |
| `ADMIN_PASSWORD`          | No       | Static admin password (overrides OTP)|
| `COMPRESSION_ENDPOINT`    | No       | Compression endpoint (bundled)       |
| `COMPRESSION_MODEL`       | No       | Compression model name               |
| `COMPRESSION_INTERVAL_MS` | No       | Tick interval (default 60000)        |
| `LLM_ENABLED`             | No       | Bundled llama-server on/off (true)   |
| `LLM_MODEL_URL`           | No       | GGUF download URL (Qwen2.5-3B)       |
| `LLM_MODEL_PATH`          | No       | GGUF path (/app/data/model.gguf)     |
| `LLM_PORT`                | No       | llama-server port (default: 8080)    |
| `LLM_CONTEXT`             | No       | llama-server context (default: 4096) |
| `LLM_THREADS`             | No       | llama-server threads (default: 4)    |
| `SSL_CERT_FILE`           | No       | TLS cert PEM path (default: cert.pem)|
| `SSL_KEY_FILE`            | No       | TLS key PEM path (default: key.pem)  |

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
