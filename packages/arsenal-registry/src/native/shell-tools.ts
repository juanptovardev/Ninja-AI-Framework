import type { ToolDefinition } from '../schema';

export const shellExecTool: ToolDefinition<
  { command: string; args?: string[] },
  { stdout: string; stderr: string; exitCode: number }
> = {
  id: 'shell.exec',
  name: 'shell.exec',
  friendlyName: 'Ejecutar comando shell',
  description: 'Ejecuta un comando del sistema operativo',
  category: 'shell',
  permission: 'restricted',
  inputSchema: undefined, // Se definirá con Zod
  outputSchema: undefined, // Se definirá con Zod
  handler: async (input, context) => {
    try {
      const startTime = Date.now();

      // Simular ejecución de comando - en la implementación real, esto interactuaría con exec
      // Para ahora, devolvemos salida simulada
      const simulatedStdout = `Comando ejecutado: ${input.command} ${(input.args || []).join(' ')}`;

      return {
        success: true,
        output: {
          stdout: simulatedStdout,
          stderr: '',
          exitCode: 0,
        },
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: `Error ejecutando comando: ${(error as Error).message}`,
        duration: 0,
      };
    }
  },
};
