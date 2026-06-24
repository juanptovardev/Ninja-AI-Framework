'use client';

import React from 'react';

export default function SetupPage() {
  const handleReload = () => {
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-[128px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-72 h-72 bg-zinc-800/20 rounded-full blur-[96px] pointer-events-none" />

      {/* Main card wrapper */}
      <div className="max-w-md w-full bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-8 backdrop-blur-xl relative z-10 shadow-2xl space-y-8 animate-fade-in">
        
        {/* Logo and header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-zinc-800/50 border border-zinc-700/30 text-3xl shadow-inner animate-pulse">
            🥷
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-zinc-100 to-zinc-400">
            Ninja AI Framework
          </h1>
          <p className="text-sm text-zinc-400">
            Unified Command Center
          </p>
        </div>

        {/* Status indicator */}
        <div className="bg-red-950/20 border border-red-900/30 rounded-xl p-4 flex items-start space-x-3 text-red-200">
          <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 animate-ping" />
          <div className="space-y-1">
            <h4 className="text-sm font-medium">Motor Fuera de Línea</h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              No se pudo detectar el Kage Runtime en el puerto <span className="font-mono text-zinc-300">3141</span>.
            </p>
          </div>
        </div>

        {/* Setup steps */}
        <div className="space-y-4">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
            ¿Cómo iniciar el sistema?
          </h3>
          <p className="text-xs text-zinc-400">
            Abre una terminal en la raíz del proyecto y ejecuta el entorno de desarrollo con soporte de concurrencia:
          </p>
          <div className="relative group">
            <pre className="bg-zinc-950/90 border border-zinc-800/80 rounded-xl p-4 text-xs font-mono text-emerald-400 overflow-x-auto shadow-inner select-all">
              pnpm dev --concurrency 50
            </pre>
            <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-[10px] text-zinc-500 pointer-events-none">
              Doble clic para copiar
            </div>
          </div>
        </div>

        {/* Action button */}
        <button
          onClick={handleReload}
          className="w-full py-3 px-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-950 font-medium rounded-xl text-sm transition-all duration-200 shadow-lg hover:shadow-zinc-200/10 active:scale-[0.98]"
        >
          Reintentar conexión
        </button>

        {/* Footnote */}
        <p className="text-center text-[10px] text-zinc-600">
          Ninja AI Framework • Dev Senior UX v1.1
        </p>

      </div>
    </div>
  );
}
