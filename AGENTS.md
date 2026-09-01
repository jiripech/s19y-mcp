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

| Variable   | Required | Description                          |
|------------|----------|--------------------------------------|
| `PORT`     | No       | Server port (default: 3000)          |
| `API_KEY`  | Yes      | Authentication key for MCP clients   |
| `DATA_DIR` | No       | Data storage directory (/app/data)   |

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
