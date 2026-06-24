'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useWsClient } from '../lib/ws-client';
import { useUccStore } from '../lib/ucc-store';
import { api } from '../lib/api';

export default function ConversationRail() {
  const { messages, sendMessage, connected } = useWsClient();
  const { mode, activeRunId } = useUccStore();
  const [input, setInput] = useState('');
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat window to bottom
  useEffect(() => {
    chatContainerRef.current?.scrollTo({
      top: chatContainerRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    if (activeRunId) {
      // Si hay una corrida activa, enviamos instrucciones contextuales (steering)
      try {
        sendMessage(input);
        await api.post('/engine/submit', {
          prompt: input,
          runId: activeRunId,
          mode: 'workspace',
          workspaceId: 'default-workspace',
        });
      } catch (err) {
        console.error('Failed to submit steering input', err);
      }
    } else {
      // Si está en idle, enviamos mensaje normal al WS
      sendMessage(input);
    }
    setInput('');
  };

  const handleQuickReply = (text: string) => {
    setInput(text);
  };

  if (mode === 'IDLE') return null;

  return (
    <div className="bg-zinc-950/60 border-t border-white/5 flex flex-col h-72 shrink-0 backdrop-blur-xl">
      {/* Messages view */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 custom-scroll"
      >
        {messages
          .filter((m) => m.sender === 'user' || m.text.includes('¿') || m.text.includes('?'))
          .map((m) => {
            const isUser = m.sender === 'user';
            return (
              <div
                key={m.id}
                className={`flex gap-3 max-w-[80%] ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm border border-white/5 ${
                  isUser ? 'bg-indigo-600/30' : 'bg-zinc-900'
                }`}>
                  {isUser ? '👤' : '🥷'}
                </div>
                <div className={`rounded-2xl px-4 py-2.5 text-sm ${
                  isUser ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-zinc-900 border border-white/5 text-zinc-200 rounded-tl-none'
                }`}>
                  <p className="leading-relaxed">{m.text}</p>
                </div>
              </div>
            );
          })}
      </div>

      {/* Suggestion Chips */}
      <div className="px-4 py-2 flex gap-2 overflow-x-auto shrink-0 scrollbar-none bg-zinc-950/20">
        {[
          'Sí, adelante.',
          'Usa Fastify para mejor rendimiento.',
          'Añade tests unitarios completos.',
          'Modifica el schema para incluir soft delete.',
        ].map((chip, idx) => (
          <button
            key={idx}
            onClick={() => handleQuickReply(chip)}
            className="text-[11px] bg-zinc-900 hover:bg-zinc-800 border border-white/5 hover:border-white/10 text-zinc-400 hover:text-zinc-200 px-3 py-1 rounded-full whitespace-nowrap transition-colors cursor-pointer shrink-0"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-white/5 flex gap-3 shrink-0 items-center">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={activeRunId ? "Envía instrucciones para guiar al modelo en vivo..." : "Escribe un mensaje..."}
          className="flex-1 bg-zinc-900 border border-white/5 focus:border-emerald-500/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none placeholder-zinc-500 transition-colors"
        />
        <button
          type="submit"
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm rounded-xl px-4 py-2.5 shadow-lg transition-all"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
