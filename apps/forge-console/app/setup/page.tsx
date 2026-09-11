'use client';

/**
 * forge-console — app/setup/page.tsx
 * Wizard de onboarding de 4 pasos (WP-E3 / T7.1):
 * 1. Env check (GET /api/doctor) · 2. Test Connection (placeholder T7.4,
 * deshabilitado) · 3. Workspace (POST /api/session/init) · 4. Tour mínimo.
 * Estados loading/success/error por paso con retry. Sin ShellLayout
 * (ClientLayout excluye /setup). Tokens: variables --ninja-* + utilidades
 * glass-card/skeleton/font-mono-data de globals.css (CONSISTENCIA_VISUAL §3).
 */
import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, PageHeader } from '@ninja/ui-kit';
import { WIZARD_STEPS, useOnboarding } from '../../lib/onboarding-store';
import type { StepId, StepStatus } from '../../lib/onboarding-store';

// ─── Piezas compartidas ──────────────────────────────────────

function StepBadge({ status, enabled }: { status: StepStatus; enabled: boolean }) {
  if (!enabled) {
    return <Badge variant="accent">T7.4</Badge>;
  }
  if (status === 'success') {
    return <Badge variant="success">Completado</Badge>;
  }
  if (status === 'error') {
    return <Badge variant="danger">Error</Badge>;
  }
  if (status === 'loading') {
    return <Badge variant="info" pulse>En curso</Badge>;
  }
  return <Badge>Pendiente</Badge>;
}

function LoadingSkeletons({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-12 w-full" />
      ))}
    </div>
  );
}

function ErrorPanel({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div className="space-y-4">
      <div className="glass-card border border-[var(--ninja-danger)]/40 p-4">
        <p className="text-sm text-[var(--ninja-text-primary)]">
          {message ?? 'Algo salió mal al contactar con el runtime.'}
        </p>
      </div>
      <Button variant="secondary" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}

// ─── Paso 1: Env check ───────────────────────────────────────

function EnvCheckStep() {
  const steps = useOnboarding((s) => s.steps);
  const doctorResult = useOnboarding((s) => s.doctorResult);
  const runEnvCheck = useOnboarding((s) => s.runEnvCheck);
  const state = steps['env-check'];

  useEffect(() => {
    if (state.status === 'idle') {
      void runEnvCheck();
    }
  }, [state.status, runEnvCheck]);

  if (state.status === 'idle' || state.status === 'loading') {
    return <LoadingSkeletons rows={4} />;
  }

  if (state.status === 'error') {
    return (
      <div className="space-y-4">
        <ErrorPanel message={state.error} onRetry={() => void runEnvCheck()} />
        <p className="text-xs text-[var(--ninja-text-muted)] font-mono-data">
          El runtime escucha en el puerto 3141. Levántalo con `pnpm ninja` y reintenta.
        </p>
      </div>
    );
  }

  if (!doctorResult) {
    return <LoadingSkeletons rows={4} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={doctorResult.failed === 0 ? 'success' : 'warning'}>
          {doctorResult.passed}/{doctorResult.total} agentes verificados
        </Badge>
        {doctorResult.failed > 0 ? (
          <Badge variant="danger">{doctorResult.failed} con archivos faltantes</Badge>
        ) : null}
      </div>
      {doctorResult.reports.length === 0 ? (
        <p className="text-sm text-[var(--ninja-text-secondary)]">
          No se detectaron clientes de agente (Cursor, VS Code, Claude…) en este equipo.
          Puedes continuar; la instalación de agentes se gestiona desde Arsenal.
        </p>
      ) : (
        <ul className="space-y-2">
          {doctorResult.reports.map((report) => (
            <li
              key={report.agentId}
              className="flex items-center justify-between gap-4 rounded-lg border border-[var(--ninja-border-subtle)] bg-[var(--ninja-bg-secondary)] px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--ninja-text-primary)] capitalize">
                  {report.agentId}
                </p>
                <p className="text-xs text-[var(--ninja-text-muted)] font-mono-data truncate">
                  {report.missing.length > 0
                    ? `faltan: ${report.missing.join(', ')}`
                    : `${report.present.length} archivos presentes`}
                  {report.warnings.length > 0 ? ` · ${report.warnings.length} avisos` : ''}
                </p>
              </div>
              <Badge variant={report.passed ? 'success' : 'danger'}>
                {report.passed ? 'OK' : 'Incompleto'}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <Button variant="ghost" size="sm" onClick={() => void runEnvCheck()}>
        Volver a verificar
      </Button>
    </div>
  );
}

// ─── Paso 2: Test connection (placeholder fuera de alcance) ──

function TestConnectionStep() {
  return (
    <div className="space-y-4">
      <Badge variant="accent">Próximamente</Badge>
      <p className="text-sm text-[var(--ninja-text-secondary)]">
        La prueba de conexión con el proveedor de modelos llegará en la etapa de proveedores
        (T7.4). Puedes continuar el asistente sin completarla: el runtime ya valida el acceso
        al LLM en tiempo de ejecución.
      </p>
      <Button variant="secondary" disabled>
        Probar conexión
      </Button>
    </div>
  );
}

// ─── Paso 3: Creación de workspace / sesión ──────────────────

function WorkspaceStep() {
  const steps = useOnboarding((s) => s.steps);
  const sessionResult = useOnboarding((s) => s.sessionResult);
  const createWorkspace = useOnboarding((s) => s.createWorkspace);
  const state = steps['create-workspace'];

  if (state.status === 'loading') {
    return <LoadingSkeletons rows={2} />;
  }

  if (state.status === 'error') {
    return <ErrorPanel message={state.error} onRetry={() => void createWorkspace()} />;
  }

  if (state.status === 'success' && sessionResult) {
    return (
      <div className="space-y-4">
        <Badge variant="success">Sesión inicializada</Badge>
        <div className="rounded-lg border border-[var(--ninja-border-subtle)] bg-[var(--ninja-bg-primary)] p-4">
          <p className="text-xs text-[var(--ninja-text-muted)] uppercase tracking-wider">
            Session ID
          </p>
          <p className="text-sm text-[var(--ninja-text-primary)] font-mono-data break-all">
            {sessionResult.sessionId}
          </p>
        </div>
        <p className="text-sm text-[var(--ninja-text-secondary)]">
          El workspace activo queda listo para recibir misiones desde Mission Control.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--ninja-text-secondary)]">
        Crea la primera sesión de trabajo sobre el workspace activo del runtime. Es el paso que
        deja el motor operativo para orquestar agentes.
      </p>
      <Button onClick={() => void createWorkspace()}>Inicializar workspace y sesión</Button>
    </div>
  );
}

// ─── Paso 4: Tour mínimo ─────────────────────────────────────

const TOUR_LINKS: { href: string; title: string; description: string }[] = [
  {
    href: '/mission-control',
    title: 'Mission Control',
    description: 'Estado operativo del motor, métricas y tareas recientes.',
  },
  {
    href: '/office',
    title: 'Office',
    description: 'La oficina digital: agentes trabajando en tiempo real.',
  },
  {
    href: '/arsenal',
    title: 'Arsenal',
    description: 'Herramientas y skills disponibles para los agentes.',
  },
  {
    href: '/settings',
    title: 'Settings',
    description: 'Proveedores de modelos y configuración del workspace.',
  },
];

function TourStep() {
  const router = useRouter();
  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--ninja-text-secondary)]">
        Todo listo. Estas son las cuatro vistas clave del Forge Console:
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {TOUR_LINKS.map((item) => (
          <Link key={item.href} href={item.href} className="block">
            <Card hoverable title={item.title} padding="sm">
              <p className="text-xs text-[var(--ninja-text-muted)]">{item.description}</p>
              <p className="text-xs text-[var(--ninja-accent)] font-mono-data mt-2">{item.href}</p>
            </Card>
          </Link>
        ))}
      </div>
      <Button onClick={() => router.push('/mission-control')}>Finalizar configuración</Button>
    </div>
  );
}

function StepContent({ stepId }: { stepId: StepId }) {
  if (stepId === 'env-check') return <EnvCheckStep />;
  if (stepId === 'test-connection') return <TestConnectionStep />;
  if (stepId === 'create-workspace') return <WorkspaceStep />;
  return <TourStep />;
}

// ─── Página ──────────────────────────────────────────────────

export default function SetupPage() {
  const currentStep = useOnboarding((s) => s.currentStep);
  const steps = useOnboarding((s) => s.steps);
  const goToStep = useOnboarding((s) => s.goToStep);
  const nextStep = useOnboarding((s) => s.nextStep);
  const prevStep = useOnboarding((s) => s.prevStep);

  const activeStep = WIZARD_STEPS[currentStep];
  if (!activeStep) {
    return null;
  }
  const isLast = currentStep === WIZARD_STEPS.length - 1;

  return (
    <div className="min-h-screen bg-[var(--ninja-bg-primary)] text-[var(--ninja-text-primary)]">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <PageHeader
          title="Configuración inicial"
          subtitle="Asistente de 4 pasos para dejar el Ninja AI Framework operativo en tu equipo."
          breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Setup' }]}
        />

        <ol className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Pasos del asistente">
          {WIZARD_STEPS.map((step, index) => (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => goToStep(index)}
                aria-current={index === currentStep ? 'step' : undefined}
                className={`w-full rounded-lg border px-3 py-3 text-left ${
                  index === currentStep
                    ? 'border-[var(--ninja-accent)] bg-[var(--ninja-surface)]'
                    : 'border-[var(--ninja-border-subtle)] hover:border-[var(--ninja-border-strong)]'
                }`}
              >
                <span className="block text-xs text-[var(--ninja-text-muted)] font-mono-data">
                  Paso {index + 1}
                </span>
                <span className="block text-sm font-medium text-[var(--ninja-text-primary)] mt-0.5">
                  {step.label}
                </span>
                <span className="mt-2 block">
                  <StepBadge status={steps[step.id].status} enabled={step.enabled} />
                </span>
              </button>
            </li>
          ))}
        </ol>

        <Card title={`${currentStep + 1}. ${activeStep.label}`} subtitle={activeStep.description}>
          <StepContent stepId={activeStep.id} />
        </Card>

        <div className="mt-6 flex items-center justify-between">
          <Button variant="ghost" onClick={prevStep} disabled={currentStep === 0}>
            Atrás
          </Button>
          {isLast ? null : (
            <Button variant={activeStep.enabled ? 'primary' : 'secondary'} onClick={nextStep}>
              {activeStep.enabled ? 'Continuar' : 'Continuar (sin probar)'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
