'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, Input, Button, Badge, Select, Divider, Spinner, PageHeader } from '@ninja/ui-kit';
import { fetchProviders, fetchWorkspaceSettings, api } from '../../lib/api';
import type { LLMProvider, WorkspaceSettings, ProviderType } from '../../lib/types';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Plus, PlugsConnected, Plugs, Key, HardDrives, Trash, PencilSimple } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { ConfirmDialog } from '../../components/ConfirmDialog';

gsap.registerPlugin(useGSAP);

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

function formatTimeAgo(timestamp: string | number): string {
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function SettingsPage() {
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
  
  const container = useRef<HTMLDivElement>(null);

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
  }, []);

  useGSAP(() => {
    if (!loading) {
      gsap.from('.setting-block', {
        y: 20,
        opacity: 0,
        duration: 0.5,
        stagger: 0.1,
        ease: 'power2.out',
        clearProps: 'all'
      });
    }
  }, { dependencies: [loading], scope: container });

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
      toast.success('Connection successful!');
    } catch (error) {
      toast.error('Connection test failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setTestingProvider(null);
    }
  };

  const handleSaveProvider = async () => {
    if (!formData.name.trim() || !formData.baseUrl.trim()) {
      toast.error('Name and Base URL are required');
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
      toast.error('Failed to save provider: ' + (error instanceof Error ? error.message : 'Unknown error'));
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
      toast.error('Failed to delete provider');
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
      toast.success('Workspace settings saved');
    } catch (error) {
      toast.error('Failed to save workspace settings: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="relative w-24 h-24">
          <div className="absolute inset-0 border-t-2 border-[var(--ninja-accent)] rounded-full animate-spin"></div>
          <div className="absolute inset-2 border-r-2 border-[var(--ninja-text-secondary)] rounded-full animate-spin reverse-spin opacity-50"></div>
        </div>
        <p className="text-[var(--ninja-text-muted)] font-mono-data tracking-widest uppercase">Loading Configuration...</p>
      </div>
    );
  }

  return (
    <div ref={container} className="flex flex-col pb-24 max-w-5xl mx-auto w-full">
      <ConfirmDialog
        open={confirmOpen}
        title="Delete Provider"
        description="Are you sure you want to delete this provider?"
        onConfirm={confirmDelete}
        onCancel={() => { setConfirmOpen(false); setPendingDeleteId(null); }}
      />
      <div className="setting-block">
        <PageHeader 
          title="Settings" 
          subtitle="Configure your workspace environment and model providers."
        />
      </div>

      <div className="setting-block mb-10">
        <h2 className="text-xl font-display font-bold text-[var(--ninja-text-primary)] mb-6 flex items-center gap-3">
          <HardDrives weight="duotone" className="text-[var(--ninja-accent)]" />
          Workspace Configuration
        </h2>
        
        <div className="glass-card p-8 border-[var(--ninja-border-subtle)]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-[var(--ninja-text-secondary)] uppercase tracking-widest mb-2">Workspace Name</label>
                <input
                  type="text"
                  value={workspaceForm.name}
                  onChange={(e) => setWorkspaceForm({ ...workspaceForm, name: e.target.value })}
                  className="w-full bg-[var(--ninja-bg-secondary)] border border-[var(--ninja-border-strong)] rounded-lg px-4 py-3 text-[var(--ninja-text-primary)] focus:border-[var(--ninja-accent)] focus:ring-1 focus:ring-[var(--ninja-accent)] transition-all outline-none"
                />
              </div>
              <Button onClick={handleSaveWorkspace} disabled={saving} variant="primary" className="bg-[var(--ninja-accent)] hover:bg-[var(--ninja-accent-hover)] text-[var(--ninja-bg-primary)]">
                {saving ? 'Saving...' : 'Save Workspace Changes'}
              </Button>
            </div>
            
            <div className="p-6 bg-[var(--ninja-bg-secondary)] rounded-xl border border-[var(--ninja-border-subtle)]">
              <h3 className="text-sm font-bold text-[var(--ninja-text-secondary)] uppercase tracking-widest mb-4">Runtime Info</h3>
              <div className="space-y-4 font-mono-data text-sm">
                <div className="flex justify-between border-b border-[var(--ninja-border-subtle)] pb-2">
                  <span className="text-[var(--ninja-text-muted)]">Path</span>
                  <span className="text-[var(--ninja-text-primary)] text-right break-all">{workspace?.path}</span>
                </div>
                <div className="flex justify-between border-b border-[var(--ninja-border-subtle)] pb-2">
                  <span className="text-[var(--ninja-text-muted)]">Created</span>
                  <span className="text-[var(--ninja-text-primary)]">{workspace?.createdAt ? new Date(workspace.createdAt).toLocaleDateString() : '-'}</span>
                </div>
                <div className="flex justify-between pb-2">
                  <span className="text-[var(--ninja-text-muted)]">Last Accessed</span>
                  <span className="text-[var(--ninja-text-primary)]">{workspace?.lastAccessed ? formatTimeAgo(workspace.lastAccessed) : '-'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="setting-block">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-display font-bold text-[var(--ninja-text-primary)] flex items-center gap-3">
            <Plugs weight="duotone" className="text-[var(--ninja-accent)]" />
            LLM Providers
          </h2>
          <Button onClick={handleAddProvider} variant="secondary" className="flex items-center gap-2 border-[var(--ninja-border-strong)] hover:border-[var(--ninja-accent)] hover:text-[var(--ninja-accent)]">
            <Plus weight="bold" />
            Add Provider
          </Button>
        </div>

        {showForm && (
          <div className="glass-card p-8 mb-8 border-[var(--ninja-accent)] shadow-[0_0_20px_var(--ninja-accent-muted)] animate-in fade-in slide-in-from-top-4 duration-300">
            <h3 className="text-lg font-bold text-[var(--ninja-text-primary)] mb-6 border-b border-[var(--ninja-border-subtle)] pb-4">
              {editingId ? 'Edit Provider Integration' : 'New Provider Integration'}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {!editingId && (
                <div className="col-span-full">
                  <label className="block text-xs font-bold text-[var(--ninja-text-secondary)] uppercase tracking-widest mb-2">Preset Template</label>
                  <select
                    className="w-full bg-[var(--ninja-bg-secondary)] border border-[var(--ninja-border-strong)] rounded-lg px-4 py-3 text-[var(--ninja-text-primary)] outline-none"
                    value={formData.providerType}
                    onChange={(e) => handleProviderTypeChange(e.target.value)}
                  >
                    {providerTypeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[var(--ninja-text-secondary)] uppercase tracking-widest mb-2">Display Name</label>
                <input
                  type="text"
                  placeholder="e.g., OpenAI Production"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-[var(--ninja-bg-secondary)] border border-[var(--ninja-border-strong)] rounded-lg px-4 py-3 text-[var(--ninja-text-primary)] outline-none focus:border-[var(--ninja-accent)]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--ninja-text-secondary)] uppercase tracking-widest mb-2">Base URL</label>
                <input
                  type="text"
                  placeholder="https://api.example.com"
                  value={formData.baseUrl}
                  onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                  className="w-full font-mono-data bg-[var(--ninja-bg-secondary)] border border-[var(--ninja-border-strong)] rounded-lg px-4 py-3 text-[var(--ninja-text-primary)] outline-none focus:border-[var(--ninja-accent)]"
                />
              </div>

              <div className="col-span-full">
                <label className="block text-xs font-bold text-[var(--ninja-text-secondary)] uppercase tracking-widest mb-2">API Key {editingId && '(Leave blank to keep existing)'}</label>
                <div className="relative">
                  <input
                    type={revealApiKey ? 'text' : 'password'}
                    placeholder="sk-..."
                    value={formData.apiKey}
                    onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                    className="w-full font-mono-data bg-[var(--ninja-bg-secondary)] border border-[var(--ninja-border-strong)] rounded-lg px-4 py-3 text-[var(--ninja-text-primary)] outline-none focus:border-[var(--ninja-accent)] pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setRevealApiKey(!revealApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ninja-text-muted)] hover:text-[var(--ninja-text-primary)]"
                  >
                    <Key weight="duotone" className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="col-span-full">
                <label className="block text-xs font-bold text-[var(--ninja-text-secondary)] uppercase tracking-widest mb-2">Available Models (comma separated)</label>
                <input
                  type="text"
                  placeholder="model-1, model-2"
                  value={formData.models}
                  onChange={(e) => setFormData({ ...formData, models: e.target.value })}
                  className="w-full font-mono-data bg-[var(--ninja-bg-secondary)] border border-[var(--ninja-border-strong)] rounded-lg px-4 py-3 text-[var(--ninja-text-primary)] outline-none focus:border-[var(--ninja-accent)]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-[var(--ninja-border-subtle)]">
              <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={handleSaveProvider} disabled={saving} className="bg-[var(--ninja-accent)] hover:bg-[var(--ninja-accent-hover)] text-[var(--ninja-bg-primary)] border-none">
                {saving ? 'Saving...' : 'Save Integration'}
              </Button>
            </div>
          </div>
        )}

        {providers.length === 0 && !showForm ? (
          <div className="glass-card p-12 text-center border-dashed border-[var(--ninja-border-strong)]">
            <PlugsConnected weight="duotone" className="w-16 h-16 text-[var(--ninja-text-muted)] mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-bold text-[var(--ninja-text-primary)] mb-2">No active providers</h3>
            <p className="text-[var(--ninja-text-secondary)] mb-6">Connect an LLM provider to enable agent orchestration.</p>
            <Button onClick={handleAddProvider} variant="secondary">Configure First Provider</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {providers.map((provider) => (
              <div key={provider.id} className="glass-card flex flex-col p-6 border-[var(--ninja-border-subtle)] hover:border-[var(--ninja-border-strong)] transition-all">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-[var(--ninja-text-primary)]">{provider.name}</h3>
                    <p className="text-sm text-[var(--ninja-text-muted)] font-mono-data mt-1">{provider.baseUrl}</p>
                  </div>
                  <Badge variant={provider.isActive ? 'success' : 'default'}>
                    {provider.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>

                <div className="mt-4 flex-1">
                  <p className="text-xs font-bold text-[var(--ninja-text-secondary)] uppercase tracking-widest mb-2">Registered Models</p>
                  <div className="flex flex-wrap gap-2">
                    {provider.models.map((model) => (
                      <span key={model} className="px-2.5 py-1 bg-[var(--ninja-bg-secondary)] border border-[var(--ninja-border-subtle)] rounded text-xs font-mono-data text-[var(--ninja-text-primary)]">
                        {model}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between items-center mt-6 pt-6 border-t border-[var(--ninja-border-subtle)]">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-[var(--ninja-info)] hover:text-white"
                    onClick={() => handleTestProvider(provider)}
                    disabled={testingProvider !== null}
                  >
                    {testingProvider === provider.id ? 'Testing...' : 'Test Connection'}
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => handleEditProvider(provider)}>
                      <PencilSimple weight="bold" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-[var(--ninja-danger)] hover:bg-[var(--ninja-danger)]/10" onClick={() => handleDeleteProvider(provider.id)}>
                      <Trash weight="bold" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
