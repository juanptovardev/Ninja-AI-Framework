'use client';

/**
 * forge-console — app/setup/page.tsx
 * Wizard de onboarding de 4 pasos (WP-E3 / T7.1, chrome i18n WP-G3 / T8.2):
 * 1. Env check (GET /api/doctor) · 2. Test Connection (GET
 * /api/model-gateway/status, T7.4) · 3. Workspace (POST /api/session/init) ·
 * 4. Tour mínimo.
 * Estados loading/success/error por paso con retry. Sin ShellLayout
 * (ClientLayout excluye /setup). Tokens: variables --ninja-* + utilidades
 * glass-card/skeleton/font-mono-data de globals.css (CONSISTENCIA_VISUAL §3).
 * Textos de chrome: useTranslations('wizard') — mensajes en
 * messages/{es,en}.json. Los títulos de vistas del tour son nombres nativos
 * (Mission Control, Office…) y NO se traducen (AGENTS.md: native names).
 */
import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Badge, Button, Card, PageHeader } from '@ninja/ui-kit';
import { WIZARD_STEPS, useOnboarding } from '../../lib/onboarding-store';
import type { StepId, StepStatus } from '../../lib/onboarding-store';

const STEP_MESSAGE_KEY: Record<StepId, 'envCheck' | 'testConnection' | 'createWorkspace' | 'tour'> = {
  'env-check': 'envCheck',
  'test-connection': 'testConnection',
  'create-workspace': 'createWorkspace',
  tour: 'tour',
};

// ─── Piezas compartidas ──────────────────────────────────────

function StepBadge({ status, enabled }: { status: StepStatus; enabled: boolean }) {
  const t = useTranslations('wizard');
  if (!enabled) {
    return <Badge variant="accent">{t('badge.gated')}</Badge>;
  }
  if (status === 'success') {
    return <Badge variant="success">{t('badge.completed')}</Badge>;
  }
  if (status === 'error') {
    return <Badge variant="danger">{t('badge.error')}</Badge>;
  }
  if (status === 'loading') {
    return <Badge variant="info" pulse>{t('badge.running')}</Badge>;
  }
  return <Badge>{t('badge.pending')}</Badge>;
}

function LoadingSkeletons({ rows = 3 }: { rows?: number }) {
  const t = useTranslations('wizard');
  return (
    <div className="space-y-3" aria-busy="true" aria-label={t('loadingAria')}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-12 w-full" />
      ))}
    </div>
  );
}

function ErrorPanel({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  const t = useTranslations('wizard');
  return (
    <div className="space-y-4">
      <div className="glass-card border border-[var(--ninja-danger)]/40 p-4">
        <p className="text-sm text-[var(--ninja-text-primary)]">{message ?? t('errorGeneric')}</p>
      </div>
      <Button variant="secondary" onClick={onRetry}>
        {t('retry')}
      </Button>
    </div>
  );
}

// ─── Paso 1: Env check ───────────────────────────────────────

function EnvCheckStep() {
  const t = useTranslations('wizard');
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
        <p className="text-xs text-[var(--ninja-text-muted)] font-mono-data">{t('envErrorHint')}</p>
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
          {t('doctorBadge', { passed: doctorResult.passed, total: doctorResult.total })}
        </Badge>
        {doctorResult.failed > 0 ? (
          <Badge variant="danger">{t('doctorFailed', { count: doctorResult.failed })}</Badge>
        ) : null}
      </div>
      {doctorResult.reports.length === 0 ? (
        <p className="text-sm text-[var(--ninja-text-secondary)]">{t('doctorNone')}</p>
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
                    ? t('reportMissing', { files: report.missing.join(', ') })
                    : t('reportPresent', { count: report.present.length })}
                  {report.warnings.length > 0
                    ? t('reportWarnings', { count: report.warnings.length })
                    : ''}
                </p>
              </div>
              <Badge variant={report.passed ? 'success' : 'danger'}>
                {report.passed ? t('reportOk') : t('reportIncomplete')}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <Button variant="ghost" size="sm" onClick={() => void runEnvCheck()}>
        {t('reverify')}
      </Button>
    </div>
  );
}

// ─── Paso 2: Test connection (T7.4) ──────────────────────────

function TestConnectionStep() {
  const t = useTranslations('wizard');
  const steps = useOnboarding((s) => s.steps);
  const connectionResult = useOnboarding((s) => s.connectionResult);
  const runTestConnection = useOnboarding((s) => s.runTestConnection);
  const state = steps['test-connection'];

  useEffect(() => {
    if (state.status === 'idle') {
      void runTestConnection();
    }
  }, [state.status, runTestConnection]);

  if (state.status === 'idle' || state.status === 'loading') {
    return <LoadingSkeletons rows={2} />;
  }

  if (state.status === 'error') {
    return (
      <div className="space-y-4">
        <ErrorPanel message={state.error} onRetry={() => void runTestConnection()} />
        <p className="text-xs text-[var(--ninja-text-muted)] font-mono-data">
          {t('connErrorHint', { endpoint: 'GET /api/model-gateway/status' })}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="success">{t('connOk')}</Badge>
        {connectionResult ? (
          <Badge variant="info" className="font-mono-data">
            {t('connLatency', { ms: connectionResult.latencyMs, count: connectionResult.modelCount })}
          </Badge>
        ) : null}
      </div>
      <p className="text-sm text-[var(--ninja-text-secondary)]">{t('connBody')}</p>
      <Button variant="ghost" size="sm" onClick={() => void runTestConnection()}>
        {t('retest')}
      </Button>
    </div>
  );
}

// ─── Paso 3: Creación de workspace / sesión ──────────────────

function WorkspaceStep() {
  const t = useTranslations('wizard');
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
        <Badge variant="success">{t('sessionBadge')}</Badge>
        <div className="rounded-lg border border-[var(--ninja-border-subtle)] bg-[var(--ninja-bg-primary)] p-4">
          <p className="text-xs text-[var(--ninja-text-muted)] uppercase tracking-wider">
            {t('sessionIdLabel')}
          </p>
          <p className="text-sm text-[var(--ninja-text-primary)] font-mono-data break-all">
            {sessionResult.sessionId}
          </p>
        </div>
        <p className="text-sm text-[var(--ninja-text-secondary)]">{t('workspaceBody')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--ninja-text-secondary)]">{t('workspaceIntro')}</p>
      <Button onClick={() => void createWorkspace()}>{t('workspaceAction')}</Button>
    </div>
  );
}

// ─── Paso 4: Tour mínimo ─────────────────────────────────────

const TOUR_LINKS: { href: string; title: string; messageKey: 'missionControl' | 'office' | 'arsenal' | 'settings' }[] =
  [
    { href: '/mission-control', title: 'Mission Control', messageKey: 'missionControl' },
    { href: '/office', title: 'Office', messageKey: 'office' },
    { href: '/arsenal', title: 'Arsenal', messageKey: 'arsenal' },
    { href: '/settings', title: 'Settings', messageKey: 'settings' },
  ];

function TourStep() {
  const t = useTranslations('wizard');
  const router = useRouter();
  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--ninja-text-secondary)]">{t('tourIntro')}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {TOUR_LINKS.map((item) => (
          <Link key={item.href} href={item.href} className="block">
            <Card hoverable title={item.title} padding="sm">
              <p className="text-xs text-[var(--ninja-text-muted)]">{t(`tour.${item.messageKey}`)}</p>
              <p className="text-xs text-[var(--ninja-accent)] font-mono-data mt-2">{item.href}</p>
            </Card>
          </Link>
        ))}
      </div>
      <Button onClick={() => router.push('/mission-control')}>{t('tourFinish')}</Button>
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
  const t = useTranslations('wizard');
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
  const activeKey = STEP_MESSAGE_KEY[activeStep.id];

  return (
    <div className="min-h-screen bg-[var(--ninja-bg-primary)] text-[var(--ninja-text-primary)]">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <PageHeader
          title={t('headerTitle')}
          subtitle={t('headerSubtitle')}
          breadcrumbs={[{ label: t('home'), href: '/' }, { label: t('setup') }]}
        />

        <ol
          className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4"
          aria-label={t('stepsAria')}
        >
          {WIZARD_STEPS.map((step, index) => {
            const key = STEP_MESSAGE_KEY[step.id];
            return (
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
                    {t('stepN', { n: index + 1 })}
                  </span>
                  <span className="block text-sm font-medium text-[var(--ninja-text-primary)] mt-0.5">
                    {t(`labels.${key}`)}
                  </span>
                  <span className="mt-2 block">
                    <StepBadge status={steps[step.id].status} enabled={step.enabled} />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <Card
          title={`${currentStep + 1}. ${t(`labels.${activeKey}`)}`}
          subtitle={t(`descriptions.${activeKey}`)}
        >
          <StepContent stepId={activeStep.id} />
        </Card>

        <div className="mt-6 flex items-center justify-between">
          <Button variant="ghost" onClick={prevStep} disabled={currentStep === 0}>
            {t('back')}
          </Button>
          {isLast ? null : (
            <Button variant={activeStep.enabled ? 'primary' : 'secondary'} onClick={nextStep}>
              {activeStep.enabled ? t('continue') : t('continueUnproven')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
