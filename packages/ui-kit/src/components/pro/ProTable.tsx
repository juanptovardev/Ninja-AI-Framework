import React from 'react';
import { Spinner } from '../base/Spinner';
import { EmptyState } from './EmptyState';
import { getProTableCellText, getProTableRowKey } from '../../utils/format';

export interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (item: T) => React.ReactNode;
  width?: 'auto' | `${number}px` | `${number}%`;
  align?: 'left' | 'center' | 'right';
  mono?: boolean;
}

export interface ProTableProps<T> {
  columns: Column<T>[];
  data: T[];
  emptyText?: string;
  emptyDescription?: string;
  loading?: boolean;
  rowKey?: (item: T, index: number) => string | number;
}

export const ProTable = <T extends Record<string, unknown>>({
  columns,
  data,
  emptyText = 'No data available',
  emptyDescription,
  loading = false,
  rowKey,
}: ProTableProps<T>) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[240px] bg-[var(--ninja-bg-primary)] rounded-lg border border-[var(--ninja-border-subtle)]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (data.length === 0) {
    return <EmptyState title={emptyText} description={emptyDescription} />;
  }

  const getRowKey = (item: T, index: number): string | number =>
    getProTableRowKey(columns, item, index, rowKey);

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--ninja-border-subtle)] bg-[var(--ninja-bg-secondary)]">
      <div className="overflow-x-auto custom-scroll">
        <table className="w-full border-collapse text-left">
          <thead className="bg-[var(--ninja-surface)] border-b border-[var(--ninja-border-strong)] z-10">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key as string}
                  style={{ width: col.width, textAlign: col.align ?? 'left' }}
                  className="px-6 py-4 text-xs font-bold text-[var(--ninja-text-secondary)] uppercase tracking-widest whitespace-nowrap"
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ninja-border-subtle)]">
            {data.map((item, rowIndex) => (
              <tr
                key={getRowKey(item, rowIndex)}
                className="hover:bg-[var(--ninja-surface-hover)] transition-colors duration-200"
              >
                {columns.map((col) => (
                  <td
                    key={col.key as string}
                    style={{ textAlign: col.align ?? 'left' }}
                    className={`px-6 py-4 text-sm text-[var(--ninja-text-primary)] ${
                      col.mono ? 'font-mono-data text-[var(--ninja-text-secondary)]' : ''
                    }`}
                  >
                    {col.render
                      ? col.render(item)
                      : getProTableCellText(item, col.key)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

ProTable.displayName = 'ProTable';
