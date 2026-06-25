import { eventBus, createEvent } from '@ninja/events';
import { createLogger } from '@ninja/logging';
import { NinjaHttpError } from './errors';
import { withRetry, RetryConfig } from './retry';
import { withTimeout } from './timeout';
import { ssrfGuard, SSRFGuardOptions } from './ssrf-guard';

const logger = createLogger('http-client');

export interface HttpRequest {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  retry?: Partial<RetryConfig>;
  ssrf?: SSRFGuardOptions | false;
}

export interface HttpResponse<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, string>;
  ok: boolean;
  url: string;
  duration: number;
}

const DEFAULT_TIMEOUT = 30000;

export async function httpRequest<T = unknown>(request: HttpRequest): Promise<HttpResponse<T>> {
  const startTime = Date.now();
  const timeout = request.timeout ?? DEFAULT_TIMEOUT;

  if (request.ssrf !== false) {
    await ssrfGuard(new URL(request.url), request.ssrf ?? {});
  }

  const executeRequest = async (): Promise<HttpResponse<T>> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const headers: Record<string, string> = {
        'User-Agent': 'Ninja-AI-Framework/1.0',
        ...request.headers,
      };

      if (request.body && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }

      const response = await globalThis.fetch(request.url, {
        method: request.method,
        headers,
        body: request.body ? JSON.stringify(request.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const duration = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        let errorData: unknown;
        try {
          errorData = errorText ? JSON.parse(errorText) : { rawText: errorText };
        } catch {
          errorData = { rawText: errorText };
        }

        eventBus.emit(
          createEvent('http.request.failed', 'integrations-http', {
            url: request.url,
            error: `HTTP ${response.status}`,
            status: response.status,
          })
        );

        throw new NinjaHttpError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          errorData,
          request.url
        );
      }

      let data: T;
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        const text = await response.text();
        try {
          data = JSON.parse(text) as T;
        } catch {
          data = text as unknown as T;
        }
      } else {
        data = (await response.text()) as unknown as T;
      }

      eventBus.emit(
        createEvent('http.request.completed', 'integrations-http', {
          url: request.url,
          method: request.method,
          status: response.status,
          duration,
        })
      );

      return {
        status: response.status,
        data,
        headers: responseHeaders,
        ok: response.ok,
        url: request.url,
        duration,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        eventBus.emit(
          createEvent('http.request.timeout', 'integrations-http', {
            url: request.url,
            timeoutMs: timeout,
          })
        );
        // S5.4 follow-up: use NinjaHttpError instead of plain Error so callers can
        // pattern-match by status. 408 = Request Timeout (RFC 7231).
        throw new NinjaHttpError(
          `Request timed out after ${timeout}ms`,
          408,
          { reason: 'timeout', timeoutMs: timeout },
          request.url
        );
      }

      throw error;
    }
  };

  if (request.retry) {
    return withRetry(executeRequest, request.retry, request.url);
  }

  return executeRequest();
}

export async function httpGet<T = unknown>(
  url: string,
  options?: Partial<HttpRequest>
): Promise<HttpResponse<T>> {
  return httpRequest<T>({
    url,
    method: 'GET',
    ...options,
  });
}

export async function httpPost<T = unknown>(
  url: string,
  body: unknown,
  options?: Partial<HttpRequest>
): Promise<HttpResponse<T>> {
  return httpRequest<T>({
    url,
    method: 'POST',
    body,
    ...options,
  });
}

export async function httpPut<T = unknown>(
  url: string,
  body: unknown,
  options?: Partial<HttpRequest>
): Promise<HttpResponse<T>> {
  return httpRequest<T>({
    url,
    method: 'PUT',
    body,
    ...options,
  });
}

export async function httpDelete<T = unknown>(
  url: string,
  options?: Partial<HttpRequest>
): Promise<HttpResponse<T>> {
  return httpRequest<T>({
    url,
    method: 'DELETE',
    ...options,
  });
}

export async function httpPatch<T = unknown>(
  url: string,
  body: unknown,
  options?: Partial<HttpRequest>
): Promise<HttpResponse<T>> {
  return httpRequest<T>({
    url,
    method: 'PATCH',
    body,
    ...options,
  });
}
