/**
 * forge-console — i18n/request.ts (WP-G3 / T8.2)
 * Configuración de petición de next-intl (patrón "sin enrutado de locales"
 * para Next 16 / next-intl v4): el locale viene de la cookie espejo que
 * escribe `LocaleSwitcher` (fuente de verdad: localStorage) con fallback
 * a `es`. Leer cookies vuelve dinámicas las rutas — aceptable: el console
 * es client-heavy por diseño.
 */
import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  normalizeLocale,
  type SupportedLocale,
} from '../lib/locale';
import esMessages from '../messages/es.json';
import enMessages from '../messages/en.json';

const MESSAGES: Record<SupportedLocale, Record<string, unknown>> = {
  es: esMessages,
  en: enMessages,
};

export default getRequestConfig(async () => {
  const store = await cookies();
  const locale = normalizeLocale(store.get(LOCALE_COOKIE_NAME)?.value) ?? DEFAULT_LOCALE;
  return {
    locale,
    messages: MESSAGES[locale],
  };
});
