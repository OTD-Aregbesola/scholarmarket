import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { withFakeTimers } from '../../../test/helpers/hookTestHelpers';
import { ToastProvider, useToast } from '../ToastProvider';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }) => React.createElement(React.Fragment, null, children),
  motion: {
    div: ({ children, layout, initial, animate, exit, transition, ...props }) =>
      React.createElement('div', props, children),
  },
}));

function Consumer() {
  const { show } = useToast();
  return (
    <button onClick={() => show({ id: 'announced', title: 'Payment complete', message: 'Receipt saved' })}>
      Show toast
    </button>
  );
}

describe('ToastProvider announcements (#162)', () => {
  withFakeTimers();

  it('renders an aria-live region even when there are no toasts', () => {
    render(React.createElement(ToastProvider, null, React.createElement(Consumer)));
    expect(document.querySelector('[aria-live="assertive"]')).toBeTruthy();
  });

  it('announces a newly shown toast inside the live region', () => {
    render(React.createElement(ToastProvider, null, React.createElement(Consumer)));

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Show toast' })); });

    const region = document.querySelector('[aria-live="assertive"]');
    expect(region).toHaveTextContent('Payment complete');
    expect(region).toHaveTextContent('Receipt saved');
  });

  it('removes a toast through its dismiss button', () => {
    render(React.createElement(ToastProvider, null, React.createElement(Consumer)));
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Show toast' })); });

    expect(screen.getByText('Payment complete')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByText('Payment complete')).toBeNull();
  });
});
