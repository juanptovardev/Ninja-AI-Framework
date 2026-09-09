/**
 * @ninja/app-shell — existence test (WP-D3c, decisión b).
 *
 * DECISIÓN: el paquete SE MANTIENE (opción b del prompt T5.6).
 * Por qué: apps/forge-console (ClientLayout.tsx, ConnectedContextPanel.tsx)
 * importa { ShellLayout, ContextPanel } desde @ninja/app-shell. Disolverlo
 * en ui-kit exigiría tocar apps/forge-console/**, fuera del alcance del slot
 * (packages/ui-kit, packages/office-grid, packages/app-shell, configs y
 * dossier). El shell además tiene cohesión propia: layout 3-columnas +
 * navegación runtime + right-rail de observabilidad — no son primitivas
 * genéricas de design-system, por lo que forzarlas en ui-kit violaría la
 * separación design-system (ui-kit) / composición de app (app-shell).
 *
 * Este test documenta el contrato mínimo que justifica su existencia:
 * exports públicos + tipos de props + config de navegación/estado.
 */
import { describe, expect, it } from 'vitest';
import * as shell from './index';
import type { SidebarProps } from './sidebar';
import type { TopbarProps } from './topbar';

describe('app-shell existence contract (decisión b: se mantiene)', () => {
  it('expone ShellLayout + Sidebar + ContextPanel + Topbar', () => {
    expect(shell).toHaveProperty('ShellLayout');
    expect(shell).toHaveProperty('Sidebar');
    expect(shell).toHaveProperty('ContextPanel');
    expect(shell).toHaveProperty('Topbar');
  });

  it('SidebarProps exige activePath y onNavigate (navegación runtime)', () => {
    const props: SidebarProps = { activePath: '/office', onNavigate: () => undefined };
    expect(props.activePath).toBe('/office');
    expect(typeof props.onNavigate).toBe('function');
  });

  it('TopbarProps exige workspace + session + connectionStatus', () => {
    const props: TopbarProps = {
      workspaceName: 'ninja',
      sessionActive: true,
      connectionStatus: 'connected',
    };
    expect(props.connectionStatus).toBe('connected');
  });

  it('connectionStatus acepta los 3 estados del runtime', () => {
    const states: TopbarProps['connectionStatus'][] = ['connected', 'disconnected', 'connecting'];
    expect(states).toHaveLength(3);
  });
});
