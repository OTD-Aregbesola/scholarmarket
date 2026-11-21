import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { resetLocalStorage } from '../../../test/helpers/hookTestHelpers';
import NotificationCenter from '../notifications/NotificationCenter';

const STORAGE_KEY = 'scholarmarket_notifications';
const item = (id, read = false) => ({
  id,
  type: 'info',
  title: `Title ${id}`,
  message: `Message ${id}`,
  read,
  createdAt: new Date(0).toISOString(),
});

describe('NotificationCenter (#159)', () => {
  resetLocalStorage({
    [STORAGE_KEY]: JSON.stringify([item('one'), item('two', true)]),
  });

  it('shows the unread count on the bell before opening', () => {
    render(React.createElement(NotificationCenter));
    expect(screen.getByRole('button', { name: /1 unread/ })).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('opens the panel and lists the five most recent notifications', () => {
    render(React.createElement(NotificationCenter));
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));

    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('Title one')).toBeTruthy();
  });

  it('marks a notification read when its row is clicked', () => {
    render(React.createElement(NotificationCenter));
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    fireEvent.click(screen.getByText('Title one'));

    expect(screen.getByRole('button', { name: /Notifications/ }).getAttribute('aria-label')).toBe('Notifications');
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)).find((n) => n.id === 'one').read).toBe(true);
  });

  it('marks everything read with the All read button', () => {
    render(React.createElement(NotificationCenter));
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    fireEvent.click(screen.getByTitle('Mark all read'));

    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)).every((n) => n.read)).toBe(true);
  });

  it('clears all notifications', () => {
    render(React.createElement(NotificationCenter));
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    fireEvent.click(screen.getByTitle('Clear all'));

    expect(screen.getByText('No notifications')).toBeTruthy();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('[]');
  });

  it('closes the panel on an outside click', () => {
    render(React.createElement(NotificationCenter));
    const bell = screen.getByRole('button', { name: /Notifications/ });
    fireEvent.click(bell);
    expect(screen.getByRole('list')).toBeTruthy();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('list')).toBeNull();
  });
});
