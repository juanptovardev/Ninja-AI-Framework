import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MCPServer } from '../mcp-server';
import type { ArsenalRegistry } from '../registry';
import { MCP_PROTOCOL_VERSION, MCP_SERVER_NAME, MCP_ERROR_CODES } from '../mcp-schema';

// Mock readline to avoid actual stdin/stdout
vi.mock('readline', () => ({
  createInterface: vi.fn(() => ({
    on: vi.fn(),
    close: vi.fn(),
  })),
}));

// Mock mcp-adapter
vi.mock('../mcp-adapter', () => ({
  listMCPTools: vi.fn().mockReturnValue([]),
  executeMCPTool: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'success' }],
    isError: false,
    structuredContent: {},
  }),
}));

// Mock logger
vi.mock('@ninja/logging', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('MCP Server', () => {
  let server: MCPServer;
  let mockRegistry: ArsenalRegistry;
  let originalConsoleError: typeof console.error;

  beforeEach(() => {
    originalConsoleError = console.error;
    console.error = vi.fn();
    
    // Create mock ArsenalRegistry
    mockRegistry = {
      listTools: vi.fn().mockReturnValue([]),
      getTool: vi.fn(),
    } as unknown as ArsenalRegistry;
    
    // Create MCPServer instance
    server = new MCPServer(mockRegistry);
  });
  
  afterEach(() => {
    console.error = originalConsoleError;
    vi.restoreAllMocks();
    server.stop();
  });
  
  describe('Server Lifecycle', () => {
    it('should initialize with correct state', () => {
      expect(server['state']).toBe('uninitialized');
    });
    
    it('should start without errors', () => {
      expect(() => server.start()).not.toThrow();
      expect(server['state']).toBe('uninitialized');
    });
    
    it('should stop without errors', () => {
      server.start();
      expect(() => server.stop()).not.toThrow();
      expect(server['state']).toBe('stopped');
    });
    
    it('should not start if already stopped', () => {
      server['state'] = 'stopped';
      const spyCreateInterface = vi.spyOn(require('readline'), 'createInterface');
      
      server.start();
      expect(spyCreateInterface).not.toHaveBeenCalled();
      spyCreateInterface.mockRestore();
    });
  });
  
  describe('Core Functionality', () => {
    it('should handle private methods without throwing', () => {
      // These tests ensure the private methods have basic error handling
      expect(() => {
        server['dispatch']({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize'
        });
      }).not.toThrow();
      
      expect(() => {
        server['handleInitialize'](1, {});
      }).not.toThrow();
      
      expect(() => {
        server['handleToolsList'](1);
      }).not.toThrow();
      
      expect(() => {
        server['handleToolsCall'](1, { name: 'test.tool' });
      }).not.toThrow();
      
      expect(() => {
        server['handlePing'](1);
      }).not.toThrow();
    });
    
    it('should handle errors in private methods', () => {
      const originalHandleInitialize = server['handleInitialize'];
      
      try {
        server['handleInitialize'] = vi.fn(() => {
          throw new Error('Test error');
        });
        
        expect(() => {
          server['dispatch']({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize'
          });
        }).not.toThrow();
        
      } finally {
        // Restore original method
        server['handleInitialize'] = originalHandleInitialize;
      }
    });
  });
  
  describe('Protocol Compliance', () => {
    it('should expose correct server information constants', () => {
      expect(MCP_PROTOCOL_VERSION).toBeDefined();
      expect(MCP_SERVER_NAME).toBeDefined();
      expect(MCP_PROTOCOL_VERSION).toBe('2025-06-18');
      expect(MCP_SERVER_NAME).toBe('ninja-arsenal-mcp');
    });
    
    it('should define all required error codes', () => {
      expect(MCP_ERROR_CODES).toEqual({
        PARSE_ERROR: -32700,
        INVALID_REQUEST: -32600,
        METHOD_NOT_FOUND: -32601,
        INVALID_PARAMS: -32602,
        INTERNAL_ERROR: -32603,
      });
    });
  });
});