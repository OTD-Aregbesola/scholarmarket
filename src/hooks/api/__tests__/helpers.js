import React from 'react';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';

/** jsdom builds without localStorage need an in-memory implementation. */
function createMemoryStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    clear() { values.clear(); },
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    key(index) { return [...values.keys()][index] ?? null; },
    removeItem(key) { values.delete(String(key)); },
    setItem(key, value) { values.set(String(key), String(value)); },
  };
}

if (typeof window !== 'undefined' && !window.localStorage) {
  Object.defineProperty(window, 'localStorage', { configurable: true, value: createMemoryStorage() });
}

/** A fresh client per test prevents cache leakage between suites. */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

/** Wraps a hook render in a QueryClientProvider. */
export function createWrapper(queryClient = createTestQueryClient()) {
  function QueryWrapper({ children }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }
  QueryWrapper.displayName = 'QueryWrapper';
  return QueryWrapper;
}

/** MSW server with a permissive unhandled-request policy for hook tests. */
export function createTestServer() {
  const server = setupServer();
  beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
  return server;
}

/** Clears storage around each test so saved-material fallbacks stay isolated. */
export function resetStorage() {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());
}
