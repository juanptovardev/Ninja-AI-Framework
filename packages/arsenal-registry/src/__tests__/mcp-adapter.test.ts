import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { arsenalToolToMCPTool, listMCPTools, executeMCPTool } from '../mcp-adapter';
import type { ArsenalRegistry } from '../registry';
import type { ToolDefinition, ToolContext, ToolResult } from '../schema';
import type { MCPTool, MCPToolCallResult } from '../mcp-schema';
import { MCP_ERROR_CODES } from '../mcp-schema';

// Mock ArsenalRegistry
type MockArsenalRegistry = {
  listTools: Mock,
  getTool: Mock,
};

function createMockRegistry(): MockArsenalRegistry {
  return {
    listTools: vi.fn(),
    getTool: vi.fn(),
  };
}

// Sample tool definitions
export const MOCK_TOOLS: ToolDefinition[] = [
  {
    id: 'fs.read',
    name: 'fs.read',
    friendlyName: 'File Read',
    description: 'Reads the contents of a file',
    category: 'filesystem',
    permission: 'safe',
    handler: vi.fn(async () => ({
      success: true,
      output: 'file content',
      duration: 0,
    })),
  },
  {
    id: 'fs.write',
    name: 'fs.write',
    friendlyName: 'File Write',
    description: 'Writes content to a file',
    category: 'filesystem',
    permission: 'confirm',
    handler: vi.fn(async () => ({
      success: true,
      output: { filePath: '/test/path' },
      duration: 0,
    })),
  },
  {
    id: 'shell.exec',
    name: 'shell.exec',
    friendlyName: 'Shell Exec',
    description: 'Executes a shell command',
    category: 'shell',
    permission: 'restricted',
    handler: vi.fn(async () => ({
      success: true,
      output: { stdout: 'command output', code: 0 },
      duration: 0,
    })),
  },
  {
    id: 'blocked.tool',
    name: 'blocked.tool',
    friendlyName: 'Blocked Tool',
    description: 'This tool should not be accessible',
    category: 'custom',
    permission: 'blocked',
    handler: vi.fn(async () => ({
      success: true,
      output: 'should not be accessible',
      duration: 0,
    })),
  },
];

describe('MCP Adapter', () => {
  let registry: MockArsenalRegistry;
  
  beforeEach(() => {
    registry = createMockRegistry();
    
    // Setup mock tools - clone to avoid reference issues
    const mockTools = MOCK_TOOLS.map(tool => ({
      ...tool,
      handler: vi.fn(tool.handler),
    }));
    
    registry.listTools.mockReturnValue(mockTools);
    mockTools.forEach(tool => {
      registry.getTool.mockImplementation((id: string) => {
        return mockTools.find(t => t.id === id) || mockTools.find(t => t.name === id) || null;
      });
    });
  });
  
  describe('arsenalToolToMCPTool()', () => {
    it('should convert a minimal Arsenal tool to MCPTool', () => {
      const arsenalTool = {
        id: 'test.tool',
        name: 'test.tool',
        friendlyName: 'Test Tool',
        description: 'A test tool',
        category: 'custom' as const,
        permission: 'safe' as const,
        handler: vi.fn(),
      };
      
      const result = arsenalToolToMCPTool(arsenalTool);
      
      expect(result).toEqual({
        name: 'test.tool',
        title: 'Test Tool',
        description: 'A test tool',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
        outputSchema: undefined,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      });
    });
    
    it('should convert an Arsenal tool with outputSchema', () => {
      const arsenalTool = {
        id: 'test.tool',
        name: 'test.tool',
        friendlyName: 'Test Tool',
        description: 'A test tool',
        category: 'custom' as const,
        permission: 'confirm' as const,
        outputSchema: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
          },
        },
        handler: vi.fn(),
      };
      
      const result = arsenalToolToMCPTool(arsenalTool);
      
      expect(result.outputSchema).toEqual({
        type: 'object',
        properties: {
          success: { type: 'boolean' },
        },
      });
      expect(result.annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      });
    });
    
    it('should correctly map permission safe to MCP annotations', () => {
      const arsenalTool = {
        id: 'test.tool',
        name: 'test.tool',
        friendlyName: 'Test Tool',
        description: 'A test tool',
        category: 'custom' as const,
        permission: 'safe' as const,
        handler: vi.fn(),
      };
      
      const result = arsenalToolToMCPTool(arsenalTool);
      
      expect(result.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
    });
    
    it('should correctly map permission confirm to MCP annotations', () => {
      const arsenalTool = {
        id: 'test.tool',
        name: 'test.tool',
        friendlyName: 'Test Tool',
        description: 'A test tool',
        category: 'custom' as const,
        permission: 'confirm' as const,
        handler: vi.fn(),
      };
      
      const result = arsenalToolToMCPTool(arsenalTool);
      
      expect(result.annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      });
    });
    
    it('should correctly map permission restricted to MCP annotations', () => {
      const arsenalTool = {
        id: 'test.tool',
        name: 'test.tool',
        friendlyName: 'Test Tool',
        description: 'A test tool',
        category: 'custom' as const,
        permission: 'restricted' as const,
        handler: vi.fn(),
      };
      
      const result = arsenalToolToMCPTool(arsenalTool);
      
      expect(result.annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      });
    });
    
    it('should use hardcoded schemas for native tools', () => {
      const nativeTools = ['fs.read', 'fs.write', 'fs.list', 'shell.exec', 'http.get', 'http.post'];
      
      nativeTools.forEach(id => {
        const arsenalTool = {
          id,
          name: id,
          friendlyName: `${id} Tool`,
          description: `Test ${id} tool`,
          category: 'custom' as const,
          permission: 'safe' as const,
          handler: vi.fn(),
        };
        
        const result = arsenalToolToMCPTool(arsenalTool);
        expect(result.inputSchema).toBeDefined();
        expect(result.inputSchema.properties).toBeDefined();
        expect(Object.keys(result.inputSchema.properties || {}).length).toBeGreaterThan(0);
      });
    });
  });
  
  describe('listMCPTools()', () => {
    it('should return all non-blocked tools converted to MCP format', () => {
      const result = listMCPTools(registry as unknown as ArsenalRegistry);
      
      expect(result.length).toBe(3); // fs.read, fs.write, shell.exec (not blocked.tool)
      expect(result.every(tool => tool.name !== 'blocked.tool')).toBe(true);
      
      // Verify each tool has correct MCP structure
      result.forEach(tool => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('title');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(tool).toHaveProperty('annotations');
      });
    });
    
    it('should return empty array when no tools are available', () => {
      registry.listTools.mockReturnValue([]);
      
      const result = listMCPTools(registry as unknown as ArsenalRegistry);
      expect(result.length).toBe(0);
    });
    
    it('should filter out blocked tools', () => {
      // Include only blocked tool
      registry.listTools.mockReturnValue([MOCK_TOOLS[3]]);
      
      const result = listMCPTools(registry as unknown as ArsenalRegistry);
      expect(result.length).toBe(0);
    });
  });
  
  describe('executeMCPTool()', () => {
    it('should successfully execute a registered tool with valid args', async () => {
      const mockHandler = vi.fn(async () => ({
        success: true,
        output: { test: 'success' },
        duration: 10,
      }));
      
      const testTool = {
        id: 'test.tool',
        name: 'test.tool',
        friendlyName: 'Test Tool',
        description: 'A test tool',
        category: 'custom' as const,
        permission: 'safe' as const,
        handler: mockHandler,
      };
      
      registry.getTool.mockReturnValue(testTool);
      
      const result = await executeMCPTool(
        registry as unknown as ArsenalRegistry,
        'test.tool',
        { arg1: 'value' }
      );
      
      expect(mockHandler).toHaveBeenCalledWith({ arg1: 'value' }, expect.objectContaining({
        agentId: 'mcp-external',
        runId: 'mcp-run', 
        sessionId: 'mcp-session',
        permissions: new Set(['safe', 'confirm']),
      }));
      
      expect(result.isError).toBe(false);
      expect(result.content[0].type).toBe('text');
      // Don't check structuredContent as it's dynamically generated based on the handler result
    });
    
    it('should return error when tool is not found', async () => {
      registry.getTool.mockReturnValue(null);
      
      const result = await executeMCPTool(
        registry as unknown as ArsenalRegistry,
        'non-existent.tool',
        {}
      );
      
      expect(result.isError).toBe(true);
      expect((result.content[0] as any).text).toBe("Tool 'non-existent.tool' not found");
    });
    
    it('should deny execution for restricted tools', async () => {
      const restrictedTool = MOCK_TOOLS[2]; // shell.exec with restricted permission
      registry.getTool.mockReturnValue(restrictedTool);
      
      const result = await executeMCPTool(
        registry as unknown as ArsenalRegistry,
        'shell.exec',
        {}
      );
      
      expect(result).toEqual({
        content: [{
          type: 'text',
          text: "Tool 'shell.exec' requiere permisos restricted. Acceso denegado desde MCP.",
        }],
        isError: true,
      });
    });
    
    it('should deny execution for blocked tools', async () => {
      const blockedTool = MOCK_TOOLS[3]; // blocked.tool with blocked permission
      registry.getTool.mockReturnValue(blockedTool);
      
      const result = await executeMCPTool(
        registry as unknown as ArsenalRegistry,
        'blocked.tool',
        {}
      );
      
      expect(result).toEqual({
        content: [{
          type: 'text',
          text: "Tool 'blocked.tool' está bloqueada por política de seguridad.",
        }],
        isError: true,
      });
    });
    
    it('should handle tool execution errors gracefully', async () => {
      const mockHandler = vi.fn(async () => ({
        success: false,
        error: 'Failed to execute tool',
        duration: 5,
      }));
      
      const testTool = {
        id: 'test.tool',
        name: 'test.tool',
        friendlyName: 'Test Tool',
        description: 'A test tool',
        category: 'custom' as const,
        permission: 'safe' as const,
        handler: mockHandler,
      };
      
      registry.getTool.mockReturnValue(testTool);
      
      const result = await executeMCPTool(
        registry as unknown as ArsenalRegistry,
        'test.tool',
        {}
      );
      
        const outputStr = JSON.stringify({ test: 'success' }, null, 2);
      expect(result.isError).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect((result.content[0] as any).text).toBe('Failed to execute tool');
    });
    
    it('should handle unexpected errors during tool execution', async () => {
      const mockHandler = vi.fn(async () => {
        throw new Error('Unexpected error');
      });
      
      const testTool = {
        id: 'test.tool',
        name: 'test.tool',
        friendlyName: 'Test Tool',
        description: 'A test tool',
        category: 'custom' as const,
        permission: 'safe' as const,
        handler: mockHandler,
      };
      
      registry.getTool.mockReturnValue(testTool);
      
      const result = await executeMCPTool(
        registry as unknown as ArsenalRegistry,
        'test.tool',
        {}
      );
      
      expect(result.isError).toBe(true);
      expect((result.content[0] as any).text).toBe('Error interno: Unexpected error');
    });
    
    it('should handle successful execution with undefined output', async () => {
      const mockHandler = vi.fn(async () => ({
        success: true,
        output: undefined,
        duration: 10,
      }));
      
      const testTool = {
        id: 'test.tool',
        name: 'test.tool',
        friendlyName: 'Test Tool',
        description: 'A test tool',
        category: 'custom' as const,
        permission: 'safe' as const,
        handler: mockHandler,
      };
      
      registry.getTool.mockReturnValue(testTool);
      
      const result = await executeMCPTool(
        registry as unknown as ArsenalRegistry,
        'test.tool',
        {}
      );
      
      expect(result).toEqual({
        content: [{
          type: 'text',
          text: 'Tool executed successfully (no output)',
        }],
        isError: false,
      });
    });
  });
});