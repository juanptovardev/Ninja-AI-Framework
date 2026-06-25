import { create } from 'zustand';
import type { NinjaEvent } from '@ninja/contracts';

interface WsMessage {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: number;
}

interface WsState {
  socket: WebSocket | null;
  messages: WsMessage[];
  connected: boolean;
  connect: (url: string) => void;
  disconnect: () => void;
  sendMessage: (text: string) => void;
  addMessage: (msg: { sender: 'user' | 'agent'; text: string }) => void;
}

// Mapeo de tipos de eventos del motor a mensajes amigables en el chat
const EVENT_MAPPERS: Record<string, (payload: any) => string | null> = {
  'engine.request.received': (p) => 
    `🎯 Nueva solicitud recibida: "${p.prompt?.substring(0, 100)}${p.prompt?.length > 100 ? '...' : ''}" (Modo: ${p.mode})`,
  
  'engine.plan.created': (p) => 
    `📋 Plan de operaciones creado con ${p.steps} tareas paso a paso.`,
  
  'engine.run.executing': () => 
    `🚀 La ejecución del plan ha sido iniciada en segundo plano.`,
  
  'engine.run.paused': () => 
    `⏸ La ejecución se encuentra pausada.`,
  
  'engine.run.completed': () => 
    `🎉 ¡Misión completada con éxito! Todos los artefactos fueron generados.`,
  
  'engine.run.failed': (p) => 
    `❌ La ejecución falló${p.data?.error ? `: ${p.data.error}` : '.'}`,

  'agent.task.started': (p) => 
    `🤖 El agente ${p.role} ha tomado la tarea y comenzó a planificar/analizar.`,

  'agent.task.completed': (p) => 
    `✅ El agente ${p.role} completó satisfactoriamente su tarea asignada.`,

  'agent.task.failed': (p) => 
    `❌ El agente ${p.role} falló al ejecutar la tarea: ${p.data?.error || 'error desconocido'}`,

  'agent.llm.called': (p) => 
    `💬 ${p.role} llamó a LLM (${p.data?.model || 'modelo default'}) consumiendo ${p.data?.tokensUsed || 0} tokens.`,

  'sentinel.approval.required': (p) => 
    `🛡️ [SENTINEL BLOCK] Aprobación requerida para realizar acción sensible: ${p.actionSummary || p.message || 'Auditoría en curso'}`
};

export const useWsClient = create<WsState>((set, get) => ({
  socket: null,
  messages: [],
  connected: false,
  connect: (url) => {
    if (get().socket) return;
    try {
      const socket = new WebSocket(url);
      socket.onopen = () => {
        // WP-B11: send auth handshake as first message
        const apiKey = process.env.NEXT_PUBLIC_RUNTIME_API_KEY;
        if (apiKey) {
          socket.send(JSON.stringify({ action: 'auth', key: apiKey }));
        }
        set({ connected: true, socket });
      };
      socket.onclose = () => set({ connected: false, socket: null });
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // 1. Mensajes legacy de texto directo
          if (data.type === 'message' && data.text) {
            get().addMessage({ sender: 'agent', text: data.text });
            return;
          }
          
          // 2. Procesar eventos tipados del EventBus de Ninja
          if (data.type && EVENT_MAPPERS[data.type]) {
            const mappedText = EVENT_MAPPERS[data.type](data.payload || {});
            if (mappedText) {
              get().addMessage({ sender: 'agent', text: mappedText });
            }
          }
        } catch (e) {
          console.error('Failed to parse WS message', e);
        }
      };
    } catch (e) {
      console.error('Failed to connect WebSocket', e);
    }
  },
  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.close();
      set({ socket: null, connected: false });
    }
  },
  sendMessage: (text) => {
    const { socket, connected } = get();
    if (socket && connected) {
      socket.send(JSON.stringify({ type: 'message', text }));
      get().addMessage({ sender: 'user', text });
    }
  },
  addMessage: (msg) => {
    set((state) => ({
      messages: [
        ...state.messages,
        { ...msg, id: Math.random().toString(36).slice(2), timestamp: Date.now() },
      ],
    }));
  },
}));
