import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  installFailingStorage,
  installMatchMedia,
  resetLocalStorage,
} from '../../../test/helpers/hookTestHelpers';
import { useThemePreference } from '../useThemePreference';

const STORAGE_KEY = 'scholarmarket-theme';

describe('useThemePreference (#162)', () => {
  resetLocalStorage();
  const system = { dark: false };
  installMatchMedia({ matches: () => system.dark });

  it('uses the dark system preference when nothing is stored', () => {
    system.dark = true;
    const { result } = renderHook(() => useThemePreference());
    expect(result.current.theme).toBe('dark');
    expect(result.current.isDark).toBe(true);
  });

  it('uses the light system preference when the system is light', () => {
    system.dark = false;
    const { result } = renderHook(() => useThemePreference());
    expect(result.current.theme).toBe('light');
  });

  it('prefers a persisted theme over the system preference', () => {
    system.dark = true;
    window.localStorage.setItem(STORAGE_KEY, 'light');
    const { result } = renderHook(() => useThemePreference());
    expect(result.current.theme).toBe('light');
  });

  it('toggles and persists the new theme', () => {
    system.dark = false;
    const { result } = renderHook(() => useThemePreference());

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('dark');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('light');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('light');
  });
});

describe('useThemePreference with unavailable storage (#162)', () => {
  installFailingStorage();
  const system = { dark: false };
  installMatchMedia({ matches: () => system.dark });

  it('falls back to the system theme without throwing', () => {
    system.dark = true;
    let result;
    expect(() => {
      result = renderHook(() => useThemePreference()).result;
    }).not.toThrow();
    expect(result.current.theme).toBe('dark');
  });

  it('still toggles in memory when persistence throws', () => {
    system.dark = false;
    const { result } = renderHook(() => useThemePreference());
    expect(() => act(() => result.current.toggleTheme())).not.toThrow();
    expect(result.current.theme).toBe('dark');
    expect(result.current.isDark).toBe(true);
  });
});
