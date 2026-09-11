/**
 * Tests ErrorBoundary (WP-D4 · Parte 1/2, T6.5a).
 *
 * El entorno vitest del repo es `environment: 'node'` y el slot prohibe dependencias nuevas
 * (sin jsdom ni @testing-library/react). React error boundaries NO operan en renderToString
 * (server), asi que se ejercita la ruta completa del protocolo de React de forma determinista:
 *   1. getDerivedStateFromError  — la transicion que React ejecuta cuando un hijo lanza.
 *   2. componentDidCatch         — el log del error (console.error), espia verifica la llamada.
 *   3. renderToString(ErrorFallback) — el fallback se renderiza con mensaje + boton de reintento.
 * La integracion DOM full (hijo que lanza → fallback en pantalla) queda cubierta por E2E
 * (Playwright, precedent EXC-3 del repo).
 *
 * Nota: el archivo es `.test.ts` (no `.tsx`) porque la config vitest incluye solo `*.test.ts`;
 * por eso se usa React.createElement en lugar de JSX.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ErrorBoundary, ErrorFallback } from '../../components/ErrorBoundary';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('un error en un hijo activa getDerivedStateFromError y el boundary pasa a estado fallback', () => {
    const error = new Error('boom interno');
    const state = ErrorBoundary.getDerivedStateFromError(error);

    expect(state.hasError).toBe(true);
    expect(state.error).toBe(error);
  });

  it('componentDidCatch registra el error en console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const instance = new ErrorBoundary({ children: null });

    instance.componentDidCatch(new Error('boom interno'), { componentStack: 'at Boom' });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      '[ErrorBoundary] Error no controlado en Forge Console:',
      expect.any(Error),
      'at Boom'
    );
  });

  it('el fallback se renderiza con el mensaje del error y el boton de reintentar', () => {
    const html = renderToString(
      React.createElement(ErrorFallback, {
        error: new Error('Kaput interno'),
        onReset: () => {},
        fallbackTitle: 'No pudimos continuar',
      })
    );

    expect(html).toContain('No pudimos continuar');
    expect(html).toContain('Kaput interno');
    expect(html).toContain('Reintentar');
  });

  it('sin error, el boundary renderiza los children intactos', () => {
    const html = renderToString(
      React.createElement(ErrorBoundary, null, React.createElement('span', null, 'contenido sano'))
    );

    expect(html).toContain('contenido sano');
    expect(html).not.toContain('Error capturado');
  });
});
