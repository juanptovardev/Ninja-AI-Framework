import * as vscode from 'vscode';
import WebSocket from 'ws';

let wsClient: WebSocket | null = null;
let reconnectInterval: NodeJS.Timeout | null = null;

export function activate(context: vscode.ExtensionContext) {
  console.log('Ninja Companion Extension is now active!');

  // Register the "Load Profile" command
  const loadProfileCmd = vscode.commands.registerCommand('ninja.loadProfile', async () => {
    vscode.window.showInformationMessage('Loading Ninja Profile...');
    
    try {
      // Connect to Kage Runtime MCP server to fetch profile
      // In a real environment, this might call the http endpoint or execute an MCP tool
      const response = await fetch('http://localhost:3141/api/vault/context?q=profile&sessionId=vscode');
      if (response.ok) {
        vscode.window.showInformationMessage('Ninja Profile loaded successfully. Supreme Orchestrator mode active!');
      } else {
        vscode.window.showWarningMessage('Ninja Runtime is running, but could not load session context.');
      }
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to load Ninja profile: ${err.message}`);
    }
  });

  context.subscriptions.push(loadProfileCmd);

  // Connect to Ninja client-adapters WebSocket server
  connectToNinjaRuntime();
}

function connectToNinjaRuntime() {
  const port = 7780;
  console.log(`Connecting to Ninja Runtime WebSocket on ws://127.0.0.1:${port}...`);

  wsClient = new WebSocket(`ws://127.0.0.1:${port}`);

  wsClient.on('open', () => {
    console.log('Connected to Ninja Runtime WebSocket');
    if (reconnectInterval) {
      clearInterval(reconnectInterval);
      reconnectInterval = null;
    }

    // Register this client as 'codex' or 'cursor' based on IDE configuration
    const isCursor = vscode.env.appName.toLowerCase().includes('cursor');
    const clientId = isCursor ? 'cursor' : 'codex';

    wsClient?.send(JSON.stringify({
      type: 'register',
      clientId,
    }));
  });

  wsClient.on('message', async (data) => {
    try {
      const payload = JSON.parse(data.toString());
      if (payload.type === 'execute_task') {
        console.log(`Received task ${payload.taskId}: ${payload.prompt}`);

        // In a real companion extension, this would delegate the prompt to the IDE's LLM context
        // and return the output. For our simulation, we return a mock successful execution.
        const output = `[Ninja VSIX Simulation on ${vscode.env.appName}] Executed task: "${payload.prompt}". All requirements completed successfully.`;
        
        wsClient?.send(JSON.stringify({
          type: 'task_result',
          taskId: payload.taskId,
          status: 'success',
          output,
        }));
      }
    } catch (err: any) {
      console.error('Error handling WebSocket message:', err);
    }
  });

  wsClient.on('close', () => {
    console.log('Connection to Ninja Runtime closed. Retrying...');
    triggerReconnection();
  });

  wsClient.on('error', (err) => {
    console.error('WebSocket connection error:', err);
    wsClient?.terminate();
  });
}

function triggerReconnection() {
  if (reconnectInterval) return;
  reconnectInterval = setInterval(() => {
    connectToNinjaRuntime();
  }, 10000); // Retry every 10s
}

export function deactivate() {
  if (wsClient) {
    wsClient.close();
  }
  if (reconnectInterval) {
    clearInterval(reconnectInterval);
  }
}
