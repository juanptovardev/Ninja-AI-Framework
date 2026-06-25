const RUNTIME_PORT = process.env.NEXT_PUBLIC_NINJA_RUNTIME_PORT || '3141';
export const BASE_URL = `http://127.0.0.1:${RUNTIME_PORT}`;
export const WS_URL =
  process.env.NEXT_PUBLIC_RUNTIME_WS_URL ?? `ws://127.0.0.1:${RUNTIME_PORT}/ws/events`;

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

export const api = {
  get,
  post,
  put,
  del,
};
