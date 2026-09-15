'use client';

/**
 * forge-console — components/EulaGate.tsx (WP-G3 / T8.2)
 * Gate de primera ejecución: mientras el EULA no esté aceptado
 * (`eula.accepted.version` en localStorage === EULA_VERSION), el árbol de
 * children NO se monta — el dashboard y sus fetches no existen hasta
 * aceptar. Tras montar, `checkEula()` resuelve el estado real desde el
 * almacén (inicial 'checking' = misma salida en SSR e hidratación).
 */
import { useEffect } from 'react';
import { EulaScreen } from './EulaScreen';
import { useUccStore } from '../lib/ucc-store';

export function EulaGate({ children }: { children: React.ReactNode }) {
  const status = useUccStore((s) => s.eulaStatus);
  const checkEula = useUccStore((s) => s.checkEula);

  useEffect(() => {
    checkEula();
  }, [checkEula]);

  if (status === 'accepted') {
    return <>{children}</>;
  }
  return <EulaScreen />;
}
