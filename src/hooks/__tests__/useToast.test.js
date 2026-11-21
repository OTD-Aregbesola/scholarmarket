import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { withFakeTimers } from '../../../test/helpers/hookTestHelpers';
import { ToastProvider } from '@/providers/ToastProvider';
import { useToast } from '../useToast';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }) => React.createElement(React.Fragment, null, children),
  motion: {
    div: ({ children, layout, initial, animate, exit, transition, ...props }) =>
      React.createElement('div', props, children),
  },
}));

describe('useToast (#162)', () => {
  withFakeTimers();

  const renderToastHook = () =>
    renderHook(() => useToast(), { wrapper: ({ children }) => React.createElement(ToastProvider, null, children) });

  it('throws when used outside a ToastProvider', () => {
    expect(() => renderHook(() => useToast())).toThrow('useToast must be used within a ToastProvider');
  });

  it('shows a toast and returns its id', () => {
    const { result } = renderToastHook();
    let id;
    act(() => { id = result.current.show({ title: 'Saved', message: 'Done', type: 'success' }); });
    expect(id).toBeTruthy();
    expect(result.current.toasts).toMatchObject([{ id, title: 'Saved', type: 'success' }]);
  });

  it('auto-dismisses a toast after its duration', () => {
    const { result } = renderToastHook();
    act(() => { result.current.show({ id: 'auto', title: 'Bye', duration: 5000 }); });
    expect(result.current.toasts).toHaveLength(1);

    act(() => { vi.advanceTimersByTime(4999); });
    expect(result.current.toasts).toHaveLength(1);

    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('does not auto-dismiss loading toasts or zero-duration toasts', () => {
    const { result } = renderToastHook();
    act(() => {
      result.current.show({ id: 'loading', type: 'loading', duration: 1000 });
      result.current.show({ id: 'sticky', duration: 0 });
    });
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(result.current.toasts.map((t) => t.id)).toEqual(['loading', 'sticky']);
  });

  it('dismisses a toast manually', () => {
    const { result } = renderToastHook();
    act(() => { result.current.show({ id: 'one' }); });
    act(() => { result.current.dismiss('one'); });
    expect(result.current.toasts).toEqual([]);
  });

  it('stacks multiple toasts and updates an existing id in place', () => {
    const { result } = renderToastHook();
    act(() => {
      result.current.show({ id: 'one', message: 'first' });
      result.current.show({ id: 'two', message: 'second' });
      result.current.show({ id: 'one', message: 'updated' });
    });
    expect(result.current.toasts).toHaveLength(2);
    expect(result.current.toasts[0]).toMatchObject({ id: 'one', message: 'updated' });
    expect(result.current.toasts[1]).toMatchObject({ id: 'two', message: 'second' });
  });

  it('updates a toast and schedules its new dismissal', () => {
    const { result } = renderToastHook();
    act(() => { result.current.show({ id: 'one', duration: 0 }); });
    act(() => { result.current.update('one', { title: 'Now closing', duration: 1000 }); });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.toasts).toEqual([]);
  });
});
