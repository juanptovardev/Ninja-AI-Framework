import type {
  SystemStatus,
  HealthStatus,
  IntakeResponse,
  LLMProvider,
  WorkspaceSettings,
} from './types';

// Simulated delay for realistic UX testing
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── System Status Mock ───────────────────────────────────────

export const mockSystemStatus: SystemStatus = {
  runsActive: 3,
  agentsActive: 7,
  systemState: 'running',
  recentTasks: [
    {
      id: 'task-001',
      name: 'Implement authentication module',
      status: 'running',
      agent: 'Backend',
      timestamp: Date.now() - 300000,
    },
    {
      id: 'task-002',
      name: 'Write unit tests for UserService',
      status: 'pending',
      agent: 'Tester',
      timestamp: Date.now() - 600000,
    },
    {
      id: 'task-003',
      name: 'Design dashboard wireframes',
      status: 'completed',
      agent: 'Designer',
      timestamp: Date.now() - 1200000,
    },
    {
      id: 'task-004',
      name: 'Review PR #142',
      status: 'failed',
      agent: 'Quality Gate',
      timestamp: Date.now() - 1800000,
    },
    {
      id: 'task-005',
      name: 'Setup database migrations',
      status: 'completed',
      agent: 'DB Architect',
      timestamp: Date.now() - 2400000,
    },
  ],
};

export async function getSystemStatus(): Promise<SystemStatus> {
  await delay(500);
  return mockSystemStatus;
}

// ─── Health Status Mock ────────────────────────────────────────

export const mockHealthStatus: HealthStatus = {
  stabilityScore: 87,
  contextEfficiency: 94,
  findings: [
    {
      id: 'f-001',
      type: 'warning',
      message: 'Token budget approaching 80% capacity',
      timestamp: Date.now() - 60000,
    },
    {
      id: 'f-002',
      type: 'info',
      message: 'Agent Backend completed task in 2.3s (15% faster than average)',
      timestamp: Date.now() - 180000,
    },
    {
      id: 'f-003',
      type: 'error',
      message: 'Agent Quality Gate failed review on PR #142 - merge conflicts detected',
      timestamp: Date.now() - 300000,
    },
    {
      id: 'f-004',
      type: 'warning',
      message: 'Memory usage elevated: 78% of allocated budget',
      timestamp: Date.now() - 420000,
    },
    {
      id: 'f-005',
      type: 'info',
      message: 'LightRAG index refresh completed successfully',
      timestamp: Date.now() - 600000,
    },
  ],
  uptime: 86400000,
  lastCheck: Date.now(),
};

export async function getHealthStatus(): Promise<HealthStatus> {
  await delay(700);
  return mockHealthStatus;
}

// ─── Intake Response Mock ──────────────────────────────────────

export const mockIntakeResponse: IntakeResponse = {
  mode: 'build',
  tasks: [
    {
      id: 't-1',
      name: 'Analyze requirements and create architecture plan',
      agent: 'Planner',
      dependencies: [],
      status: 'pending',
    },
    {
      id: 't-2',
      name: 'Design database schema',
      agent: 'DB Architect',
      dependencies: ['t-1'],
      status: 'pending',
    },
    {
      id: 't-3',
      name: 'Implement core backend services',
      agent: 'Backend',
      dependencies: ['t-2'],
      status: 'pending',
    },
    {
      id: 't-4',
      name: 'Create API endpoints',
      agent: 'Connector',
      dependencies: ['t-3'],
      status: 'pending',
    },
    {
      id: 't-5',
      name: 'Design UI components',
      agent: 'Designer',
      dependencies: ['t-1'],
      status: 'pending',
    },
    {
      id: 't-6',
      name: 'Implement frontend integration',
      agent: 'Backend',
      dependencies: ['t-4', 't-5'],
      status: 'pending',
    },
    {
      id: 't-7',
      name: 'Write integration tests',
      agent: 'Tester',
      dependencies: ['t-6'],
      status: 'pending',
    },
    {
      id: 't-8',
      name: 'Quality review and validation',
      agent: 'Quality Gate',
      dependencies: ['t-7'],
      status: 'pending',
    },
  ],
  estimatedTokens: 24500,
};

export async function submitToIntake(prompt: string): Promise<IntakeResponse> {
  await delay(1200);

  if (!prompt.trim()) {
    throw new Error('Prompt cannot be empty');
  }

  return {
    ...mockIntakeResponse,
    estimatedTokens: Math.floor(15000 + Math.random() * 20000),
  };
}

// ─── Settings Mock ──────────────────────────────────────────────

export const mockProviders: LLMProvider[] = [
  {
    id: 'p-1',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com',
    models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    isActive: true,
  },
  {
    id: 'p-2',
    name: 'Ollama',
    baseUrl: 'http://localhost:11434',
    models: ['llama2', 'codellama', 'mistral'],
    isActive: true,
  },
  {
    id: 'p-3',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    models: ['claude-3-opus', 'claude-3-sonnet'],
    isActive: false,
  },
  {
    id: 'p-4',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai',
    models: ['mixtral-8x7b', 'llama2-70b'],
    isActive: false,
  },
];

export const mockWorkspaceSettings: WorkspaceSettings = {
  name: 'my-ninja-project',
  path: '/Users/dev/projects/my-ninja-project',
  createdAt: Date.now() - 86400000 * 7,
  lastAccessed: Date.now() - 7200000,
};

export async function getProviders(): Promise<LLMProvider[]> {
  await delay(400);
  return mockProviders;
}

export async function getWorkspaceSettings(): Promise<WorkspaceSettings> {
  await delay(300);
  return mockWorkspaceSettings;
}

export async function testProviderConnection(_baseUrl: string, _apiKey?: string): Promise<boolean> {
  await delay(1000);
  return true;
}

export async function saveProvider(provider: Partial<LLMProvider>): Promise<LLMProvider> {
  await delay(600);
  return {
    ...provider,
    id: provider.id || `p-${Date.now()}`,
    isActive: provider.isActive ?? true,
    models: provider.models || [],
  } as LLMProvider;
}

export async function saveWorkspaceSettings(
  settings: Partial<WorkspaceSettings>
): Promise<WorkspaceSettings> {
  await delay(500);
  return {
    ...mockWorkspaceSettings,
    ...settings,
  };
}

export async function deleteProvider(_id: string): Promise<void> {
  await delay(400);
}
