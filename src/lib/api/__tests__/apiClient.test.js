import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { apiClient, getCsrfTokenFromCookie } from '../apiClient';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  vi.restoreAllMocks();
});
afterAll(() => server.close());

describe('getCsrfTokenFromCookie (#144)', () => {
  it('returns null when no CSRF cookie is present', () => {
    expect(getCsrfTokenFromCookie()).toBeNull();
  });

  it('decodes a CSRF cookie value', () => {
    document.cookie = 'csrf_token=token%20with%20space';
    expect(getCsrfTokenFromCookie()).toBe('token with space');
  });

  it('returns the raw value when decoding fails', () => {
    document.cookie = 'csrf_token=%E0%A4%A';
    expect(getCsrfTokenFromCookie()).toBe('%E0%A4%A');
  });
});

describe('apiClient success parsing (#144)', () => {
  it('parses a JSON response and sends CSRF and body headers', async () => {
    document.cookie = 'csrf_token=csrf-123';
    let seen;
    server.use(http.get('*/api/items', ({ request }) => {
      seen = request;
      return HttpResponse.json({ items: [1, 2] });
    }));

    const data = await apiClient('/api/items');

    expect(data).toEqual({ items: [1, 2] });
    expect(seen.headers.get('x-csrf-token')).toBe('csrf-123');
    expect(seen.headers.get('content-type')).toContain('application/json');
  });

  it('serializes a JSON body and uses POST by default', async () => {
    let seen;
    server.use(http.post('*/api/items', async ({ request }) => {
      seen = { method: request.method, body: await request.text() };
      return HttpResponse.json({ ok: true }, { status: 201 });
    }));

    const data = await apiClient('/api/items', { body: { title: 'Notes' } });

    expect(data).toEqual({ ok: true });
    expect(seen.method).toBe('POST');
    expect(JSON.parse(seen.body)).toEqual({ title: 'Notes' });
  });

  it('returns raw text for non-JSON responses', async () => {
    server.use(http.get('*/api/text', () => new HttpResponse('plain text', {
      headers: { 'content-type': 'text/plain' },
    })));

    expect(await apiClient('/api/text')).toBe('plain text');
  });
});

describe('apiClient error mapping (#144)', () => {
  it('refreshes an expired session once and retries the original request', async () => {
    let calls = 0;
    server.use(
      http.post('*/api/auth/refresh', () => HttpResponse.json({ success: true })),
      http.get('*/api/retry-after-refresh', () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ detail: 'expired' }, { status: 401 })
          : HttpResponse.json({ ok: true });
      }),
    );
    expect(await apiClient('/api/retry-after-refresh')).toEqual({ ok: true });
    expect(calls).toBe(2);
  });

  it('maps a problem+json response into a typed error', async () => {
    server.use(http.get('*/api/problem', () => HttpResponse.json({
      type: 'https://example.test/validation',
      title: 'Validation failed',
      status: 422,
      detail: 'Price is required',
      instance: '/api/problem',
      errors: [{ field: 'price', message: 'required' }],
    }, {
      status: 422,
      headers: { 'content-type': 'application/problem+json' },
    })));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(apiClient('/api/problem')).rejects.toMatchObject({
      message: 'Price is required',
      status: 422,
      title: 'Validation failed',
      type: 'https://example.test/validation',
      instance: '/api/problem',
      errors: [{ field: 'price', message: 'required' }],
      data: expect.objectContaining({ status: 422 }),
    });
  });

  it('uses the response status when the body omits one', async () => {
    server.use(http.get('*/api/plain-error', () => HttpResponse.json({ error: 'Not allowed' }, { status: 403 })));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(apiClient('/api/plain-error')).rejects.toMatchObject({
      message: 'Not allowed',
      status: 403,
    });
  });

  it('maps a text error body and warns on 401', async () => {
    server.use(http.get('*/api/unauthorized', () => new HttpResponse('Session expired', {
      status: 401,
      headers: { 'content-type': 'text/plain' },
    })));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(apiClient('/api/unauthorized')).rejects.toMatchObject({
      message: 'Session expired',
      status: 401,
    });
    expect(warn).toHaveBeenCalledWith('API Unauthorized: Possible session expiry');
  });

  it('does not retry 4xx or 5xx responses', async () => {
    for (const status of [400, 500]) {
      let calls = 0;
      server.use(http.get('*/api/fail', () => {
        calls += 1;
        return HttpResponse.json({ detail: `status ${status}` }, { status });
      }));
      vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(apiClient('/api/fail', { retries: 3, retryDelayMs: 0 })).rejects.toMatchObject({ status });
      expect(calls).toBe(1);
      server.resetHandlers();
    }
  });
});

describe('apiClient retries and abort (#144)', () => {
  it('retries network errors and succeeds on a later attempt', async () => {
    let calls = 0;
    server.use(http.get('*/api/flaky', () => {
      calls += 1;
      if (calls < 3) return HttpResponse.error();
      return HttpResponse.json({ recovered: true });
    }));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const data = await apiClient('/api/flaky', { retries: 3, retryDelayMs: 1 });

    expect(data).toEqual({ recovered: true });
    expect(calls).toBe(3);
  });

  it('stops after the configured number of retries', async () => {
    let calls = 0;
    server.use(http.get('*/api/down', () => {
      calls += 1;
      return HttpResponse.error();
    }));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(apiClient('/api/down', { retries: 2, retryDelayMs: 0 })).rejects.toThrow();
    expect(calls).toBe(3);
  });

  it('does not retry an aborted request', async () => {
    let calls = 0;
    server.use(http.get('*/api/slow', async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 200));
      return HttpResponse.json({ ok: true });
    }));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const controller = new AbortController();
    const pending = apiClient('/api/slow', { signal: controller.signal, retries: 5, retryDelayMs: 0 });
    setTimeout(() => controller.abort(), 10);

    await expect(pending).rejects.toThrow(/abort/i);
    expect(calls).toBeLessThanOrEqual(1);
  });
});
