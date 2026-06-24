import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { RosterManager } from '../roster.js';

// Mock logger
vi.mock('@ninja/logging', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('RosterManager', () => {
  const tempRosterPath = path.join(os.tmpdir(), `ninja_roster_test_${Date.now()}.json`);

  beforeEach(() => {
    if (fs.existsSync(tempRosterPath)) {
      fs.unlinkSync(tempRosterPath);
    }
  });

  afterEach(() => {
    if (fs.existsSync(tempRosterPath)) {
      fs.unlinkSync(tempRosterPath);
    }
  });

  it('should initialize a new roster file if it does not exist', () => {
    const manager = new RosterManager(tempRosterPath);
    expect(manager.exists()).toBe(false);

    manager.unlock();
    expect(manager.exists()).toBe(true);
    
    const roster = manager.getRoster();
    expect(roster.version).toBe('1.1.0');
    expect(roster.roles.orchestrator).toBe('codex');
    expect(roster.roles.sentinel).toBe('claude-code');
  });

  it('should unlock and read existing roster', () => {
    const manager = new RosterManager(tempRosterPath);
    manager.unlock();
    
    // Add an API Key
    manager.setApiKey('openai', 'sk-openai-key-value');

    // Create a new instance and unlock
    const secondManager = new RosterManager(tempRosterPath);
    expect(secondManager.exists()).toBe(true);
    
    secondManager.unlock();
    const decryptedKey = secondManager.getApiKey('openai');
    expect(decryptedKey).toBe('sk-openai-key-value');
  });

  it('should assign roles correctly', () => {
    const manager = new RosterManager(tempRosterPath);
    manager.unlock();

    // Mock client configuration
    const roster = manager.getRoster();
    roster.clients['cursor'] = {
      id: 'cursor',
      name: 'CURSOR',
      type: 'gui',
      executablePath: '',
      configPath: '',
      configDir: '',
      mcpConfigPath: '',
      skillsDir: '',
      agentsDir: '',
      delegationModel: 'full',
      status: 'connected',
      capabilities: [],
      assignedRole: 'worker',
      connectionMethod: { type: 'headless-cli', command: 'cursor', flags: [] },
      supportsAutoInstall: false,
      installCommand: '',
      installUrl: '',
    };

    manager.assignRole('cursor', 'orchestrator');
    expect(manager.getRoster().roles.orchestrator).toBe('cursor');
    expect(manager.getRoster().clients['cursor'].assignedRole).toBe('orchestrator');
  });
});
