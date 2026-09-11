'use client';

import React from 'react';
import { Badge, Button, Card } from '@ninja/ui-kit';

// ─── Fallback UI (presentational) ─────────────────────────────

export interface ErrorFallbackProps {
  error: Error | null;
  fallbackTitle?: string;
  onReset?: () => void;
}

export function ErrorFallback({ error, fallbackTitle = 'Algo salió mal', onReset }: ErrorFallbackProps) {
  const message = error instanceof Error ? error.message : String(error);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card
        title={fallbackTitle}
        subtitle="El Forge Console encontró un error inesperado. La vista se detuvo para proteger el estado de la aplicación."
        className="w-full max-w-md"
        footer={
          onReset ? (
            <Button onClick={onReset} variant="primary">
              Reintentar
            </Button>
          ) : undefined
        }
      >
        <Badge variant="danger" pulse>
          Error capturado
        </Badge>
        <p className="mt-3 text-xs font-mono-data break-all" data-testid="error-boundary-message">
          {message}
        </p>
      </Card>
    </div>
  );
}

ErrorFallback.displayName = 'ErrorFallback';

// ─── Error boundary (logica) ─────────────────────────────────

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  static displayName = 'ErrorBoundary';

  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Error no controlado en Forge Console:', error, info.componentStack);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          fallbackTitle={this.props.fallbackTitle}
          onReset={this.handleReset}
        />
      );
    }
    return this.props.children;
  }
}