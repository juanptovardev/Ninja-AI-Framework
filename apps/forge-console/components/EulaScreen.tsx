'use client';

/**
 * forge-console — components/EulaScreen.tsx (WP-G3 / T8.2)
 * Pantalla bloqueante del EULA de primera ejecución. Tres variantes según
 * `eulaStatus` del store: checking (spinner), pending (texto + Aceptar/
 * Declinar) y declined (mensaje de cierre). Renderizada por `EulaGate`
 * ANTES que cualquier funcionalidad.
 *
 * Estilo: patrón real de forge-console — componentes ui-kit (Card/Button/
 * Spinner) + vars --ninja-* vía arbitrary values (CONSISTENCIA_VISUAL §6:
 * cero HEX literales, cero style={{}}, cero vars nuevas). z modal 1200 (§2.3).
 */
import { Button, Card, Spinner } from '@ninja/ui-kit';
import { useTranslations } from 'next-intl';
import { EULA_VERSION } from '../lib/eula';
import { useUccStore } from '../lib/ucc-store';

function Clause({ title, body }: { title: string; body: string }) {
  return (
    <section className="space-y-1">
      <h2 className="text-sm font-semibold text-[var(--ninja-text-primary)]">{title}</h2>
      <p className="text-sm text-[var(--ninja-text-secondary)] leading-relaxed">{body}</p>
    </section>
  );
}

export function EulaScreen() {
  const t = useTranslations('eula');
  const status = useUccStore((s) => s.eulaStatus);
  const acceptEula = useUccStore((s) => s.acceptEula);
  const declineEula = useUccStore((s) => s.declineEula);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('title')}
      data-testid="eula-screen"
      data-eula-status={status}
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-[var(--ninja-bg-primary)] px-6 py-12"
    >
      <div className="w-full max-w-2xl space-y-6">
        <Card title={t('title')} subtitle={t('version', { version: EULA_VERSION })} padding="md">
          {status === 'checking' ? (
            <div className="flex justify-center p-8" aria-busy="true">
              <Spinner />
            </div>
          ) : status === 'declined' ? (
            <div className="space-y-2" data-testid="eula-declined">
              <h2 className="text-sm font-semibold text-[var(--ninja-text-primary)]">
                {t('declinedTitle')}
              </h2>
              <p className="text-sm text-[var(--ninja-text-secondary)] leading-relaxed">
                {t('declinedBody')}
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <p className="text-sm text-[var(--ninja-text-secondary)] leading-relaxed">
                {t('intro')}
              </p>
              <Clause title={t('licenseTitle')} body={t('licenseBody')} />
              <Clause title={t('warrantyTitle')} body={t('warrantyBody')} />
              <Clause title={t('privacyTitle')} body={t('privacyBody')} />
              <div className="flex items-center justify-end gap-3 pt-2">
                <Button variant="ghost" onClick={declineEula}>
                  {t('decline')}
                </Button>
                <Button variant="primary" onClick={() => acceptEula()}>
                  {t('accept')}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
