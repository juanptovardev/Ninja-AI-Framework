const RUNTIME_PORT = process.env.NEXT_PUBLIC_NINJA_RUNTIME_PORT || '3141';
export const BASE_URL = `http://127.0.0.1:${RUNTIME_PORT}`;
export const WS_URL =
  process.env.NEXT_PUBLIC_RUNTIME_WS_URL ?? `ws://127.0.0.1:${RUNTIME_PORT}/ws/events`;

// WP-B11: X-Ninja-Key header for authenticated runtime requests.
// Local-first key sources (in order): NEXT_PUBLIC_RUNTIME_API_KEY env, then a
// locally configured key in localStorage (`ninja.runtime.key` — single-user,
// single-machine product; the E2E seeds it from ~/.ninja/runtime.key).
const RUNTIME_API_KEY = process.env.NEXT_PUBLIC_RUNTIME_API_KEY ?? '';
const LOCAL_KEY_STORAGE = 'ninja.runtime.key';

function readLocalRuntimeKey(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(LOCAL_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

function authHeaders(): Record<string, string> {
  const key = RUNTIME_API_KEY || readLocalRuntimeKey();
  return key ? { 'X-Ninja-Key': key } : {};
}

export interface ApiError {
  message: string;
  code?: string;
  status: number;
}

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const url = `${BASE_URL}${path}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        data: null,
        error: {
          message: errorData.message || errorData.error || `HTTP ${response.status}`,
          code: errorData.code,
          status: response.status,
        },
      };
    }

    const data = await response.json();
    return { data, error: null };
  } catch (err) {
    // ─── ERROR ON FETCH ───
    console.error(`[API] Failed connecting to ${url}`);
    return {
      data: null,
      error: {
        message: err instanceof Error ? err.message : String(err),
        status: 500,
      },
    };
  }
}

export async function get<T>(path: string): Promise<ApiResponse<T>> {
  return request<T>(path, { method: 'GET' });
}

export async function post<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
  return request<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function put<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
  return request<T>(path, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function del<T>(path: string): Promise<ApiResponse<T>> {
  return request<T>(path, { method: 'DELETE' });
}

// ─── Typed API Helpers ──────────────────────────────────────────
import type { DashboardData, PulseData, LLMProvider, WorkspaceSettings } from './types';

export async function fetchDashboard(): Promise<DashboardData> {
  const res = await get<DashboardData>('/api/dashboard');
  return res.data!;
}

export async function fetchHealthPulse(): Promise<PulseData> {
  const res = await get<PulseData>('/api/health/pulse');
  return res.data!;
}

export async function fetchProviders(): Promise<LLMProvider[]> {
  const res = await get<LLMProvider[]>('/api/settings/providers');
  return res.data || [];
}

export async function fetchWorkspaceSettings(): Promise<WorkspaceSettings> {
  const res = await get<WorkspaceSettings>('/api/settings/workspace');
  return res.data!;
}

export async function saveProvider(input: {
  id?: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  models: string[];
  isActive: boolean;
}): Promise<ApiResponse<LLMProvider>> {
  return post<LLMProvider>('/api/settings/providers', input);
}

export async function deleteProvider(id: string): Promise<ApiResponse<LLMProvider>> {
  return del<LLMProvider>(`/api/settings/providers/${id}`);
}

export async function saveWorkspaceSettings(name: string): Promise<ApiResponse<WorkspaceSettings>> {
  return post<WorkspaceSettings>('/api/settings/workspace', { name });
}

// ─── Test Connection (T7.4 / WP-E4) ───────────────────────────

/**
 * Resultado de una prueba de conexión contra el runtime (browser-safe:
 * fetch con AbortController, sin importar @ninja/integrations-llm, que
 * no es seguro de navegador — node:crypto/fs en su grafo de dependencias).
 */
export interface ProviderTestResult {
  reachable: boolean;
  latencyMs: number;
  /** Modelos registrados en el catálogo del Model Gateway (0 si desconocido). */
  modelCount: number;
  error: string | null;
}

interface ModelGatewayStatusPayload {
  catalogSize?: unknown;
}

/**
 * Prueba de conexión real contra `GET /api/model-gateway/status`:
 * verifica que el runtime responde y cuánto tarda, y reporta el tamaño
 * del catálogo de modelos. Timeout duro via AbortController (5 s por defecto).
 *
 * Limitación documentada (dossier WP-E4): el runtime no expone hoy un
 * endpoint de ping por-proveedor contra el LLM; este endpoint es el más
 * cercano existente y valida runtime + gateway. Crear el endpoint queda
 * fuera del alcance de esta tarea (no se toca kage-runtime).
 */
export async function testModelGatewayConnection(timeoutMs = 5000): Promise<ProviderTestResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${BASE_URL}/api/model-gateway/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      return {
        reachable: false,
        latencyMs,
        modelCount: 0,
        error: `HTTP ${response.status}`,
      };
    }

    const body = (await response.json().catch(() => ({}))) as ModelGatewayStatusPayload;
    const modelCount = typeof body.catalogSize === 'number' ? body.catalogSize : 0;
    return { reachable: true, latencyMs, modelCount, error: null };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startedAt;
    if (controller.signal.aborted) {
      return {
        reachable: false,
        latencyMs,
        modelCount: 0,
        error: `Timeout tras ${timeoutMs}ms`,
      };
    }
    return {
      reachable: false,
      latencyMs,
      modelCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  get,
  post,
  put,
  del,
};
