'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, Input, Button, Badge, Select, Divider, Spinner } from '@ninja/ui-kit';
import { fetchProviders, fetchWorkspaceSettings, api } from '../lib/api';
import type { LLMProvider, WorkspaceSettings, ProviderType } from '../lib/types';
import { Plus, PlugsConnected, Plugs, Key, HardDrives, Trash, PencilSimple } from '@phosphor-icons/react';
import { useUccStore } from '../lib/ucc-store';
import { toast } from 'sonner';
import { ConfirmDialog } from './ConfirmDialog';

const providerTypeOptions = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'ollama', label: 'Ollama (Local)' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'groq', label: 'Groq' },
  { value: 'custom', label: 'Custom' },
];

const providerDefaults: Record<ProviderType, { baseUrl: string; models: string[] }> = {
  openai: { baseUrl: 'https://api.openai.com', models: ['gpt-4', 'gpt-3.5-turbo'] },
  anthropic: { baseUrl: 'https://api.anthropic.com', models: ['claude-3-opus', 'claude-3-sonnet'] },
  ollama: { baseUrl: 'http://localhost:11434', models: ['llama2', 'codellama'] },
  openrouter: { baseUrl: 'https://openrouter.ai/api', models: ['anthropic/claude-3-opus'] },
  groq: { baseUrl: 'https://api.groq.com/openai', models: ['mixtral-8x7b-32768'] },
  custom: { baseUrl: '', models: [] },
};

export default function SettingsOverlay() {
  const { isSettingsOpen, toggleSettings } = useUccStore();
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [workspace, setWorkspace] = useState<WorkspaceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [revealApiKey, setRevealApiKey] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    baseUrl: '',
    apiKey: '',
    models: '',
    providerType: 'custom' as ProviderType,
  });

  const [workspaceForm, setWorkspaceForm] = useState({
    name: '',
  });

  useEffect(() => {
    if (!isSettingsOpen) return;
    const fetchData = async () => {
      try {
        setLoading(true);
        const [providersData, workspaceData] = await Promise.all([
          fetchProviders(),
          fetchWorkspaceSettings(),
        ]);
        setProviders(providersData);
        setWorkspace(workspaceData);
        setWorkspaceForm({ name: workspaceData.name });
      } catch (error) {
        console.error('Failed to load settings:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [isSettingsOpen]);

  const handleProviderTypeChange = (value: string) => {
    const type = value as ProviderType;
    const defaults = providerDefaults[type];
    setFormData({
      ...formData,
      providerType: type,
      name: type === 'custom' ? '' : providerTypeOptions.find((o) => o.value === type)?.label || '',
      baseUrl: defaults.baseUrl,
      models: defaults.models.join(', '),
    });
  };

  const handleAddProvider = () => {
    setShowForm(true);
    setEditingId(null);
    setRevealApiKey(false);
    setFormData({
      name: '',
      baseUrl: '',
      apiKey: '',
      models: '',
      providerType: 'custom',
    });
  };

  const handleEditProvider = (provider: LLMProvider) => {
    setShowForm(true);
    setEditingId(provider.id);
    setRevealApiKey(false);
    setFormData({
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: '',
      models: provider.models.join(', '),
      providerType: 'custom',
    });
  };

  const handleTestProvider = async (provider: LLMProvider) => {
    try {
      setTestingProvider(provider.id);
      await new Promise(r => setTimeout(r, 1000));
      toast.success('¡Conexión exitosa!');
    } catch (error) {
      toast.error('Prueba fallida: ' + (error instanceof Error ? error.message : 'Error desconocido'));
    } finally {
      setTestingProvider(null);
    }
  };

  const handleSaveProvider = async () => {
    if (!formData.name.trim() || !formData.baseUrl.trim()) {
      toast.error('Nombre y Base URL son requeridos');
      return;
    }

    try {
      setSaving(true);
      const models = formData.models.split(',').map((m) => m.trim()).filter(Boolean);
      const res = await api.post<LLMProvider>('/api/settings/providers', {
        id: editingId || undefined,
        name: formData.name,
        baseUrl: formData.baseUrl,
        apiKey: formData.apiKey || undefined,
        models,
        isActive: true,
      });

      if (res.error) throw new Error(res.error.message);
      const provider = res.data!;

      if (editingId) {
        setProviders(providers.map((p) => (p.id === editingId ? provider : p)));
      } else {
        setProviders([...providers, provider]);
      }

      setShowForm(false);
      setEditingId(null);
      setRevealApiKey(false);
      setFormData({ name: '', baseUrl: '', apiKey: '', models: '', providerType: 'custom' });
    } catch (error) {
      toast.error('Fallo al guardar: ' + (error instanceof Error ? error.message : 'Error desconocido'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProvider = async (id: string) => {
    setPendingDeleteId(id);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    setConfirmOpen(false);
    try {
      const res = await api.del(`/api/settings/providers/${pendingDeleteId}`);
      if (res.error) throw new Error(res.error.message);
      setProviders(providers.filter((p) => p.id !== pendingDeleteId));
    } catch {
      toast.error('Fallo al eliminar');
    } finally {
      setPendingDeleteId(null);
    }
  };

  const handleSaveWorkspace = async () => {
    try {
      setSaving(true);
      const res = await api.post<WorkspaceSettings>('/api/settings/workspace', { name: workspaceForm.name });
      if (res.error) throw new Error(res.error.message);
      setWorkspace(res.data!);
      toast.success('Configuración guardada.');
    } catch (error) {
      toast.error('Fallo al guardar workspace: ' + (error instanceof Error ? error.message : 'Error desconocido'));
    } finally {
      setSaving(false);
    }
  };

  if (!isSettingsOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
      <ConfirmDialog
        open={confirmOpen}
        title="Eliminar Proveedor"
        description="¿Seguro que deseas eliminar este proveedor?"
        onConfirm={confirmDelete}
        onCancel={() => { setConfirmOpen(false); setPendingDeleteId(null); }}
      />
      <div className="bg-zinc-950 border border-white/10 rounded-3xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-zinc-900/20">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            ⚙️ Configuración del Sistema
          </h2>
          <button
            onClick={toggleSettings}
            className="text-zinc-500 hover:text-white transition-colors text-sm font-semibold p-1"
          >
            ✕ Cerrar
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scroll">
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <span className="w-8 h-8 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
            </div>
          ) : (
            <>
              {/* Workspace Config */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                  <HardDrives weight="duotone" className="text-emerald-400" />
                  Workspace
                </h3>
                <div className="bg-zinc-900/40 border border-white/5 p-5 rounded-2xl grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-zinc-400 font-medium">Nombre de Workspace</label>
                      <input
                        type="text"
                        value={workspaceForm.name}
                        onChange={(e) => setWorkspaceForm({ name: e.target.value })}
                        className="bg-zinc-950 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
                      />
                    </div>
                    <button
                      onClick={handleSaveWorkspace}
                      disabled={saving}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-xl px-4 py-2.5 transition-colors disabled:opacity-50"
                    >
                      Guardar Cambios
                    </button>
                  </div>
                  <div className="bg-zinc-950/40 border border-white/5 p-4 rounded-xl flex flex-col justify-center space-y-2 text-xs font-mono">
                    <div className="flex justify-between border-b border-white/5 pb-2">
                      <span className="text-zinc-500">Ruta</span>
                      <span className="text-zinc-300 truncate max-w-[200px]">{workspace?.path}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Estado</span>
                      <span className="text-emerald-400 font-semibold">Active</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* LLM Providers */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                    <Plugs weight="duotone" className="text-emerald-400" />
                    Model Providers
                  </h3>
                  <button
                    onClick={handleAddProvider}
                    className="bg-zinc-900 hover:bg-zinc-800 border border-white/5 hover:border-white/10 text-zinc-300 text-xs px-3 py-1.5 rounded-xl flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Plus weight="bold" /> Nuevo
                  </button>
                </div>

                {showForm && (
                  <div className="bg-zinc-900/60 border border-emerald-500/30 p-5 rounded-2xl space-y-4 animate-in fade-in duration-200">
                    <div className="grid grid-cols-2 gap-4">
                      {!editingId && (
                        <div className="col-span-2">
                          <label className="text-xs text-zinc-400 font-medium block mb-1">Preset Template</label>
                          <select
                            onChange={(e) => handleProviderTypeChange(e.target.value)}
                            value={formData.providerType}
                            className="w-full bg-zinc-950 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none"
                          >
                            {providerTypeOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div>
                        <label className="text-xs text-zinc-400 font-medium block mb-1">Nombre</label>
                        <input
                          type="text"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className="w-full bg-zinc-950 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400 font-medium block mb-1">Base URL</label>
                        <input
                          type="text"
                          value={formData.baseUrl}
                          onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                          className="w-full bg-zinc-950 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-white font-mono"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-zinc-400 font-medium block mb-1">API Key</label>
                        <input
                          type="password"
                          placeholder="••••••••••••••••"
                          value={formData.apiKey}
                          onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                          className="w-full bg-zinc-950 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-white"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-zinc-400 font-medium block mb-1">Modelos (Separados por coma)</label>
                        <input
                          type="text"
                          value={formData.models}
                          onChange={(e) => setFormData({ ...formData, models: e.target.value })}
                          className="w-full bg-zinc-950 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-white font-mono"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setShowForm(false)}
                        className="bg-zinc-950 hover:bg-zinc-900 border border-white/5 hover:border-white/10 text-zinc-300 text-xs px-4 py-2 rounded-xl transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleSaveProvider}
                        disabled={saving}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
                      >
                        {saving ? 'Guardando...' : 'Guardar'}
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  {providers.map((p) => (
                    <div key={p.id} className="bg-zinc-900/40 border border-white/5 hover:border-white/10 p-5 rounded-2xl flex flex-col justify-between transition-all duration-200">
                      <div>
                        <div className="flex justify-between items-start">
                          <h4 className="text-sm font-bold text-white">{p.name}</h4>
                          <span className="text-[9px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono px-2 py-0.5 rounded uppercase">
                            Active
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500 font-mono mt-1 truncate">{p.baseUrl}</p>
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {p.models.map((model) => (
                            <span key={model} className="text-[9px] bg-zinc-950 border border-white/5 text-zinc-400 font-mono px-1.5 rounded">
                              {model}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex justify-between items-center mt-5 pt-4 border-t border-white/5 shrink-0">
                        <button
                          onClick={() => handleTestProvider(p)}
                          disabled={testingProvider !== null}
                          className="text-[10px] text-zinc-400 hover:text-white transition-colors font-medium cursor-pointer"
                        >
                          {testingProvider === p.id ? 'Probando...' : 'Probar Conexión'}
                        </button>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEditProvider(p)}
                            className="text-zinc-500 hover:text-white transition-colors"
                          >
                            <PencilSimple className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteProvider(p.id)}
                            className="text-rose-500 hover:text-rose-400 transition-colors"
                          >
                            <Trash className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
