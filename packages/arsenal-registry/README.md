# @ninja/arsenal-registry

Central registry for skills, tools and actions in Ninja AI Framework.

## Overview

The Arsenal Registry is the centralized registry of skills, tools and actions in the Ninja AI Framework. It acts as the unified catalog that allows agents to discover and use tools both by technical names and descriptive names.

## Features

- Centralized tool registration and discovery
- Dual exposure: technical (by exact command name) and friendly (by descriptive name)
- Permission-based access control
- Integration with the event system
- Native tools for filesystem, shell, HTTP operations
- Skill composition from multiple tools

## Installation

```bash
pnpm add @ninja/arsenal-registry
```

## Usage

```typescript
import { ArsenalRegistry, bootstrap } from '@ninja/arsenal-registry';

// Initialize registry
const registry = bootstrap();

// Or get existing instance
const registry = ArsenalRegistry.getInstance();

// Find tools by friendly name
const tools = registry.findByFriendlyName('read file');

// Execute a tool
const tool = registry.getTool('fs.read');
if (tool) {
  const result = await tool.handler({ path: './example.txt' }, context);
}
```

## Permissions

- `safe`: Automatic safe execution
- `confirm`: Requires user confirmation
- `restricted`: Requires special permissions
- `blocked`: Completely blocked

## MCP Protocol (Model Context Protocol)

The Arsenal Registry can be exposed as an MCP server for external AI tools (Claude Desktop, Cursor, etc.):

```typescript
import { MCPServer, ArsenalRegistry } from '@ninja/arsenal-registry';

// Get registry instance
const registry = ArsenalRegistry.getInstance();

// Create and start MCP server
const mcpServer = new MCPServer(registry);
mcpServer.start();

// Server reads from stdin, writes to stdout (JSON-RPC 2.0 over stdio)
```

### Supported MCP Methods

- `initialize` — Client-server handshake
- `tools/list` — List available tools
- `tools/call` — Execute a tool
- `ping` — Heartbeat

### Events Emitted

- `mcp.server.started` — When server initializes
- `mcp.tool.called` — After each tool execution
- `mcp.server.stopped` — When server shuts down

### Security Notes

- Tools with `blocked` permission are NOT exposed
- Tools with `restricted` permission are DENIED by default
- MCP clients have limited context: `{ agentId: 'mcp-external', permissions: ['safe', 'confirm'] }`

## License

MIT
