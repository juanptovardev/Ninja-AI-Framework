'use client';

/**
 * forge-console — components/LocaleSwitcher.tsx (WP-G3 / T8.2)
 * Switch de idioma ES/EN persistente. Fuente de verdad: localStorage
 * (`ninja.locale`); se espeja a la cookie `locale` para que el SSR de
 * next-intl (i18n/request.ts) renderice el mismo idioma tras el refresh.
 * Al montar, si localStorage diverge de lo servido (cookie), se aplica
 * lo almacenado. Control flotante: no depende del ShellLayout (app-shell
 * está fuera del alcance del WP).
 */
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@ninja/ui-kit';
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  applyLocale,
  normalizeLocale,
  readStoredLocale,
  type SupportedLocale,
} from '../lib/locale';
import { resolveKeyValueStore } from '../lib/kv-store';

export function LocaleSwitcher() {
  const t = useTranslations('locale');
  const serverLocale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [applied, setApplied] = useState<SupportedLocale>(
    normalizeLocale(serverLocale) ?? DEFAULT_LOCALE
  );

  useEffect(() => {
    const stored = readStoredLocale(resolveKeyValueStore());
    if (stored !== applied) {
      applyLocale(stored, {
        storage: null, // ya persistido: solo re-sincroniza cookie + refresh
        doc: typeof document === 'undefined' ? null : document,
        refresh: () => startTransition(() => router.refresh()),
      });
      setApplied(stored);
    }
    // Solo al montar: después manda el click del usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = (locale: SupportedLocale) => {
    if (locale === applied) {
      return;
    }
    applyLocale(locale, {
      storage: resolveKeyValueStore(),
      doc: typeof document === 'undefined' ? null : document,
      refresh: () => startTransition(() => router.refresh()),
    });
    setApplied(locale);
  };

  return (
    <div
      role="group"
      aria-label={t('aria')}
      data-testid="locale-switcher"
      data-pending={isPending ? 'true' : 'false'}
      className="fixed bottom-4 right-4 z-[1100] flex items-center gap-1 rounded-lg border border-[var(--ninja-border)] bg-[var(--ninja-surface)] p-1"
    >
      {SUPPORTED_LOCALES.map((locale) => (
        <Button
          key={locale}
          size="sm"
          variant={locale === applied ? 'primary' : 'ghost'}
          aria-pressed={locale === applied}
          aria-label={t('switchTo', {
            lang: locale === 'es' ? t('spanish') : t('english'),
          })}
          onClick={() => handleSelect(locale)}
        >
          {locale.toUpperCase()}
        </Button>
      ))}
    </div>
  );
}
