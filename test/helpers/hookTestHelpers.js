import { afterEach, beforeEach, vi } from 'vitest';

/** Minimal Storage implementation for jsdom builds without localStorage. */
export function createMemoryStorage() {
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

// Vitest 4 on Node 26 can expose jsdom without window.localStorage. The hooks
// under test read it synchronously at render time, so install a memory-backed
// implementation before any hook module is imported.
if (typeof window !== 'undefined' && !window.localStorage) {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: createMemoryStorage(),
  });
}

/** jsdom has no matchMedia. Installs a controllable stub and cleans it up. */
export function installMatchMedia({ matches = false } = {}) {
  let stub;
  let original;

  beforeEach(() => {
    original = window.matchMedia;
    stub = vi.fn().mockImplementation((query) => ({
      matches: typeof matches === 'function' ? matches(query) : matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    window.matchMedia = stub;
  });

  afterEach(() => {
    window.matchMedia = original;
  });

  return {
    get mock() { return stub; },
  };
}

/** Enables fake timers for the suite and always restores real timers. */
export function withFakeTimers() {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });
}

/** A Storage-like object whose every operation throws. */
export function createFailingStorage() {
  const fail = () => {
    throw new Error('Storage is unavailable');
  };
  return {
    getItem: vi.fn(fail),
    setItem: vi.fn(fail),
    removeItem: vi.fn(fail),
    clear: vi.fn(fail),
    key: vi.fn(fail),
    length: 0,
  };
}

/** Replaces window.localStorage with a failing implementation for one suite. */
export function installFailingStorage() {
  let descriptor;

  beforeEach(() => {
    descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: createFailingStorage(),
    });
  });

  afterEach(() => {
    if (descriptor) {
      Object.defineProperty(window, 'localStorage', descriptor);
    } else {
      delete window.localStorage;
    }
  });
}

/** Gives each test a clean localStorage, optionally seeded with values. */
export function resetLocalStorage(initial = {}) {
  beforeEach(() => {
    window.localStorage.clear();
    for (const [key, value] of Object.entries(initial)) {
      window.localStorage.setItem(key, value);
    }
  });
  afterEach(() => window.localStorage.clear());
}
