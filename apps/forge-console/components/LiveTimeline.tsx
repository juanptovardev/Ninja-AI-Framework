'use client';

import React, { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useWsClient } from '../lib/ws-client';
import { useUccStore } from '../lib/ucc-store';

export default function LiveTimeline() {
  const { messages, connect, connected } = useWsClient();
  const { mode } = useUccStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Auto-connect WS when component mounts
  useEffect(() => {
    const port = process.env.NEXT_PUBLIC_NINJA_RUNTIME_PORT || '3141';
    connect(`ws://127.0.0.1:${port}/ws/events`);
  }, [connect]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (mode === 'IDLE') {
    return (
      <div className="flex flex-col h-full items-center justify-center p-6 text-zinc-500 text-center select-none">
        <span className="text-3xl mb-2">⏳</span>
        <p className="text-sm font-medium">Línea de tiempo inactiva</p>
        <p className="text-xs text-zinc-600 mt-1 max-w-[200px]">Envia una orden para arrancar la monitorización.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950/40 border-r border-white/5 w-80 shrink-0">
      <div className="p-4 border-b border-white/5 flex items-center justify-between bg-zinc-950/20">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
          Línea de Tiempo Viva
        </h3>
        <span className="text-[10px] bg-zinc-900 px-2 py-0.5 rounded text-zinc-500 font-mono">
          WS: {connected ? 'ON' : 'OFF'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scroll">
        {messages.length === 0 ? (
          <div className="text-zinc-600 text-xs italic py-6 text-center">
            Esperando eventos del motor...
          </div>
        ) : (
          <div className="relative ml-3 pl-4">
            {/* SVG vertical connector line */}
            <svg
              className="absolute left-0 top-0 w-px pointer-events-none"
              style={{ height: '100%' }}
              aria-hidden="true"
            >
              <line
                x1="0.5" y1="0" x2="0.5" y2="100%"
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="1"
              />
            </svg>

            <div className="space-y-6">
              {messages.map((msg) => {
                const dateStr = new Date(msg.timestamp).toLocaleTimeString('es-ES', {
                  hour12: false,
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                });

                const isUser = msg.sender === 'user';
                const isSentinel = msg.text.includes('[SENTINEL BLOCK]');
                const isSuccess = msg.text.includes('completada') || msg.text.includes('completó');
                const isError = msg.text.includes('falló') || msg.text.includes('falló');

                // Extract runId from message text if present (format: runId=<uuid>)
                const runIdMatch = msg.text.match(/runId[=:]([a-f0-9-]{36})/i);
                const runId = runIdMatch?.[1];

                return (
                  <div
                    key={msg.id}
                    className={`relative group animate-in fade-in slide-in-from-left-1 duration-200 ${isSuccess && runId ? 'cursor-pointer' : ''}`}
                    onClick={isSuccess && runId ? () => router.push(`/artifacts?runId=${runId}`) : undefined}
                    title={isSuccess && runId ? 'View artifacts for this run' : undefined}
                  >
                    {/* SVG dot on the timeline */}
                    <svg
                      className="absolute -left-[22px] top-1"
                      width="11" height="11"
                      aria-hidden="true"
                    >
                      <circle
                        cx="5.5" cy="5.5" r="4"
                        fill={
                          isUser ? '#818cf8' :
                          isSentinel ? '#f43f5e' :
                          isSuccess ? '#10b981' :
                          isError ? '#f43f5e' : '#71717a'
                        }
                        stroke="#09090b"
                        strokeWidth="2"
                      />
                    </svg>

                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-zinc-500 font-mono tracking-tight">
                        {dateStr}
                        {isSuccess && runId && (
                          <span className="ml-1 text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity">
                            → artifacts
                          </span>
                        )}
                      </span>
                      <p className={`text-xs leading-relaxed ${
                        isUser ? 'text-indigo-200 font-medium' :
                        isSentinel ? 'text-rose-200 font-semibold' :
                        isSuccess ? 'text-emerald-300' :
                        isError ? 'text-rose-300' : 'text-zinc-300'
                      }`}>
                        {msg.text}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
