import React from 'react';
import { CaretRight } from '@phosphor-icons/react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  extra?: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  badge,
  extra,
  breadcrumbs,
}) => {
  return (
    <header className="bg-transparent border-b border-[var(--ninja-border-subtle)] pb-6 mb-8">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-2 text-sm font-semibold tracking-wide text-[var(--ninja-text-muted)] mb-4">
          {breadcrumbs.map((item, index) => (
            <React.Fragment key={index}>
              {index > 0 && <CaretRight weight="bold" className="w-3 h-3 text-[var(--ninja-border-strong)]" />}
              {item.href ? (
                <a href={item.href} className="hover:text-[var(--ninja-accent)] transition-colors duration-200">
                  {item.label}
                </a>
              ) : (
                <span className="text-[var(--ninja-text-secondary)]">{item.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-4">
            <h1 className="font-display text-4xl sm:text-5xl tracking-tighter text-[var(--ninja-text-primary)] truncate">
              {title}
            </h1>
            {badge && <div className="mt-2">{badge}</div>}
          </div>
          {subtitle && <p className="text-base sm:text-lg text-[var(--ninja-text-secondary)] mt-2 font-light leading-relaxed max-w-2xl">{subtitle}</p>}
        </div>

        {extra && (
          <div className="flex flex-wrap items-center gap-4 shrink-0 mt-4 md:mt-0">
            {extra}
          </div>
        )}
      </div>
    </header>
  );
};

PageHeader.displayName = 'PageHeader';
