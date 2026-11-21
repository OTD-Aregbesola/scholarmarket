import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  installFailingStorage,
  resetLocalStorage,
} from '../../../test/helpers/hookTestHelpers';
import { useNotifications } from '../useNotifications';

const STORAGE_KEY = 'scholarmarket_notifications';

describe('useNotifications (#159)', () => {
  resetLocalStorage();

  it('starts with the welcome notification and one unread item', () => {
    const { result } = renderHook(() => useNotifications());
    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].id).toBe('welcome-1');
    expect(result.current.unreadCount).toBe(1);
  });

  it('adds a notification and persists it', async () => {
    const { result } = renderHook(() => useNotifications());
    act(() => result.current.addNotification({ title: 'Sale', message: 'You made a sale', type: 'success' }));

    expect(result.current.notifications[0]).toMatchObject({ title: 'Sale', read: false, type: 'success' });
    expect(result.current.unreadCount).toBe(2);
    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toHaveLength(2);
    });
  });

  it('marks a single notification as read', () => {
    const { result } = renderHook(() => useNotifications());
    act(() => result.current.addNotification({ title: 'Second' }));
    const id = result.current.notifications[0].id;

    act(() => result.current.markRead(id));
    expect(result.current.notifications.find((n) => n.id === id).read).toBe(true);
    expect(result.current.unreadCount).toBe(1);
  });

  it('marks all notifications as read', () => {
    const { result } = renderHook(() => useNotifications());
    act(() => result.current.addNotification({ title: 'Second' }));
    act(() => result.current.markAllRead());
    expect(result.current.unreadCount).toBe(0);
  });

  it('clears all notifications and storage', async () => {
    const { result } = renderHook(() => useNotifications());
    act(() => result.current.clearAll());
    expect(result.current.notifications).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
    await waitFor(() => expect(window.localStorage.getItem(STORAGE_KEY)).toBe('[]'));
  });

  it('restores persisted notifications on mount', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([
      { id: 'saved', type: 'info', title: 'Earlier', message: 'Restored', read: true, createdAt: new Date(0).toISOString() },
    ]));
    const { result } = renderHook(() => useNotifications());
    expect(result.current.notifications.map((n) => n.id)).toEqual(['saved']);
    expect(result.current.unreadCount).toBe(0);
  });
});

describe('useNotifications with unavailable storage (#159)', () => {
  installFailingStorage();

  it('still works in memory without throwing', () => {
    const { result } = renderHook(() => useNotifications());
    expect(() => act(() => result.current.addNotification({ title: 'Still works' }))).not.toThrow();
    expect(result.current.notifications).toHaveLength(2);
    expect(result.current.unreadCount).toBe(2);
  });

  it('clears in memory even when persistence throws', () => {
    const { result } = renderHook(() => useNotifications());
    expect(() => act(() => result.current.clearAll())).not.toThrow();
    expect(result.current.notifications).toEqual([]);
  });
});
