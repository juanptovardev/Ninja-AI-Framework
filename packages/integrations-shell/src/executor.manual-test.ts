import { executeCommand } from './executor.js';
import { validateCommand } from './sandbox.js';

// Test básico para verificar que el paquete funciona
async function testBasicCommand(): Promise<void> {
  try {
    // Test a simple command that should be allowed
    const result = await executeCommand({
      cmd: 'node',
      args: ['--version'],
      timeout: 5000,
    });

    console.log('Node version:', result.stdout.trim());
    console.log('Command executed successfully');
  } catch (error) {
    console.error('Error executing command:', error);
  }
}

// Test command validation
function testCommandValidation(): void {
  // Test a blocked command
  const blockedCommand = {
    cmd: 'rm',
    args: ['-rf', '/'],
    cwd: '/tmp',
  };

  const validation = validateCommand(blockedCommand);
  console.log('Blocked command validation:', validation);

  // Test a safe command
  const safeCommand = {
    cmd: 'ls',
    args: ['-la'],
    cwd: process.cwd(),
  };

  const safeValidation = validateCommand(safeCommand);
  console.log('Safe command validation:', safeValidation);
}

// Run tests
testCommandValidation();
testBasicCommand().catch(console.error);
