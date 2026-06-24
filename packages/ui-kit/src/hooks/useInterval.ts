import { useEffect, useRef } from 'react';

/**
 * Hook para ejecutar un callback periódicamente con intervalo configurable
 * @param callback - Función a ejecutar en cada intervalo
 * @param delay - Delay en milisegundos, o null para pausar el intervalo
 */
export function useInterval(callback: () => void, delay: number | null): void {
  const savedCallback = useRef<(() => void) | null>(null);

  // Guardar el callback más reciente
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Configurar y limpiar el intervalo
  useEffect(() => {
    if (delay === null) {
      return;
    }

    const tick = () => {
      if (savedCallback.current) {
        savedCallback.current();
      }
    };

    const id = setInterval(tick, delay);
    return () => clearInterval(id);
  }, [delay]);
}
