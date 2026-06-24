import type { ToolDefinition } from '../schema';

export const httpGetTool: ToolDefinition<
  { url: string; headers?: Record<string, string> },
  { status: number; data: unknown }
> = {
  id: 'http.get',
  name: 'http.get',
  friendlyName: 'Hacer petición GET',
  description: 'Realiza una petición HTTP GET a un endpoint',
  category: 'http',
  permission: 'safe',
  inputSchema: undefined, // Se definirá con Zod
  outputSchema: undefined, // Se definirá con Zod
  handler: async (input, context) => {
    try {
      const startTime = Date.now();

      // Simular petición HTTP - en la implementación real, esto interactuaría con fetch
      // Para ahora, devolvemos datos simulados
      const simulatedData = { message: `Simulated GET response from ${input.url}` };

      return {
        success: true,
        output: {
          status: 200,
          data: simulatedData,
        },
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: `Error en petición GET: ${(error as Error).message}`,
        duration: 0,
      };
    }
  },
};

export const httpPostTool: ToolDefinition<
  { url: string; body: unknown; headers?: Record<string, string> },
  { status: number; data: unknown }
> = {
  id: 'http.post',
  name: 'http.post',
  friendlyName: 'Hacer petición POST',
  description: 'Realiza una petición HTTP POST a un endpoint',
  category: 'http',
  permission: 'confirm',
  inputSchema: undefined, // Se definirá con Zod
  outputSchema: undefined, // Se definirá con Zod
  handler: async (input, context) => {
    try {
      const startTime = Date.now();

      // Simular petición HTTP - en la implementación real, esto interactuaría con fetch
      // Para ahora, devolvemos datos simulados
      const simulatedData = {
        message: `Simulated POST response from ${input.url}`,
        receivedBody: input.body,
      };

      return {
        success: true,
        output: {
          status: 200,
          data: simulatedData,
        },
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: `Error en petición POST: ${(error as Error).message}`,
        duration: 0,
      };
    }
  },
};
