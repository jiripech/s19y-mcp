# S19y MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> Self Reflexion Memory MCP Server built with agent for agents

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

The server speaks MCP over SSE
([Streamable HTTP](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
or SSE). Add it to your opencode config:

```json
{
  "mcp": {
    "shared-memory": {
      "type": "remote",
      "url": "http://localhost:3000/sse",
      "headers": {
        "X-API-Key": "your-api-key-here"
      }
    }
  }
}
```

The server exposes five MCP tools, available to agents as
`shared-memory_<tool>`. To let all agents use the shared memory freely,
allow them in the opencode `permission` block:

```json
{
  "permission": {
    "shared-memory_list_memories": "allow",
    "shared-memory_retrieve_memory": "allow",
    "shared-memory_search_memories": "allow",
    "shared-memory_store_memory": "allow",
    "shared-memory_delete_memory": "allow"
  }
}
```

| Tool             | Description                             |
|------------------|-----------------------------------------|
| `store_memory`   | Store a new memory or reflection        |
| `retrieve_memory`| Retrieve a specific memory by name      |
| `search_memories`| Search memories by content              |
| `list_memories`  | List all stored memories                |
| `delete_memory`  | Delete a memory by name                 |

Restart opencode after changing the config.

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

## Configuration

| Variable           | Description              | Default                    |
|--------------------|--------------------------|----------------------------|
| `PORT`             | Server port              | `3000`                     |
| `API_KEY`          | Client authentication key| `none`                     |
| `DATA_DIR`         | Data storage directory   | `/app/data`                |
| `MEMORY_FILE_PATH` | Memory file location     | `<DATA_DIR>/memory.jsonl`  |
| `NODE_ENV`         | Environment              | `development`              |

Every `store_memory` and `delete_memory` call writes the full memory
graph to disk immediately, so data survives container restarts. The
memory file lives at [`MEMORY_FILE_PATH`](#configuration)
(default `<DATA_DIR>/memory.jsonl`); mounting a volume at `DATA_DIR`
persists it across container replacement.

## API Reference

The server provides the following MCP tools:

- `store_memory` - Store a new memory or reflection
- `retrieve_memory` - Retrieve a specific memory by name
- `search_memories` - Search memories by content or tags
- `list_memories` - List all stored memories
- `delete_memory` - Delete a memory by name

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
