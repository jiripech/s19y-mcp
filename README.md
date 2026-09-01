# S19y MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> Self Reflexion Memory MCP Server built with agent for agents

## Description

S19y MCP Server is a Model Context Protocol (MCP) server that provides
self-reflexion memory capabilities for AI agents. It enables agents to store,
retrieve, and reflect on their experiences, creating a persistent memory layer
that enhances agent capabilities across sessions.

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

```bash
git clone https://github.com/jiripech/s19y-mcp.git
cd s19y-mcp
docker build -t s19y-mcp .
docker run -p 3000:3000 s19y-mcp
```

### Push to Docker Hub

```bash
DOCKER_NAMESPACE=your-user DOCKER_TAG=1.0.0 ./scripts/build.sh
```

### Configure local opencode client

```json
{
  "mcp": {
    "shared-memory": {
      "type": "sse",
      "url": "http://localhost:3000/sse",
      "headers": {
        "X-API-Key": "your-api-key-here"
      }
    }
  }
}
```

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

Once running, set your API key and connect your MCP-compatible agent to the
server.

## Configuration

| Variable   | Description | Default       |
|------------|-------------|---------------|
| `PORT`     | Server port | `3000`        |
| `NODE_ENV` | Environment | `development` |

## API Reference

The server provides the following MCP tools:

- `store_memory` - Store a new memory/reflection
- `retrieve_memory` - Retrieve memories by query
- `list_memories` - List all stored memories

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

## Support

- [GitHub Issues](https://github.com/jiripech/s19y-mcp/issues)
- [GitHub Discussions](https://github.com/jiripech/s19y-mcp/discussions)

---

**Author:** RevoFab s.r.o.
