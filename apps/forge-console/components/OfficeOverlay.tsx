'use client';

import React from 'react';
import { OfficeCanvas } from '@ninja/office-grid';
import { useUccStore } from '../lib/ucc-store';

export default function OfficeOverlay() {
  const { isOfficeOpen, toggleOffice } = useUccStore();

  if (!isOfficeOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-zinc-950 border border-white/10 rounded-3xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 border-b border-white/5 flex justify-between items-center bg-zinc-900/20 shrink-0">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            🏢 Office Grid Control Canvas (⌘O)
          </h2>
          <button
            onClick={toggleOffice}
            className="text-zinc-500 hover:text-white transition-colors text-sm font-semibold p-1"
          >
            ✕ Cerrar
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden relative">
          <OfficeCanvas />
        </div>
      </div>
    </div>
  );
}
