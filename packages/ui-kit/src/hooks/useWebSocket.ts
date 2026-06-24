import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook para conectar a un WebSocket y recibir eventos en tiempo real
 * @template T - Tipo de dato esperado en los mensajes recibidos
 * @param url - URL del WebSocket a conectar
 * @returns Objeto con datos, estado de conexión, error y función para enviar mensajes
 */
export function useWebSocket<T>(url: string): {
  data: T | null;
  connected: boolean;
  error: string | null;
  send: (msg: string) => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setError(null);
        retryCountRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const parsedData = JSON.parse(event.data) as T;
          setData(parsedData);
        } catch (parseError) {
          console.error('Failed to parse WebSocket message:', parseError);
        }
      };

      ws.onclose = () => {
        setConnected(false);

        // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
        const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 30000);
        retryCountRef.current += 1;

        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
        }

        retryTimerRef.current = setTimeout(() => {
          connect();
        }, delay);
      };

      ws.onerror = (event) => {
        setError('WebSocket connection error');
        setConnected(false);
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create WebSocket');
    }
  }, [url]);

  const send = useCallback((msg: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(msg);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send message');
      }
    } else {
      setError('Cannot send: WebSocket not connected');
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { data, connected, error, send };
}
