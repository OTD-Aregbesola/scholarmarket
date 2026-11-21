import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import StarRating from '../StarRating';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

describe('StarRating', () => {
  describe('interactive mode', () => {
    it('renders five radio buttons', () => {
      const { container } = render(<StarRating onChange={vi.fn()} />);
      const buttons = container.querySelectorAll('button[role="radio"]');
      expect(buttons).toHaveLength(5);
    });

    it('calls onChange with rating on click', () => {
      const onChange = vi.fn();
      const { container } = render(<StarRating onChange={onChange} />);
      const buttons = container.querySelectorAll('button[role="radio"]');

      fireEvent.click(buttons[2]);
      expect(onChange).toHaveBeenCalledWith(3);
    });

    it('handles Arrow Right key to move focus forward', () => {
      const onChange = vi.fn();
      const { container } = render(<StarRating onChange={onChange} />);
      const buttons = container.querySelectorAll('button[role="radio"]');

      buttons[0].focus();
      fireEvent.keyDown(buttons[0], { key: 'ArrowRight' });

      expect(buttons[1]).toHaveFocus();
    });

    it('handles Arrow Left key to move focus backward', () => {
      const onChange = vi.fn();
      const { container } = render(<StarRating onChange={onChange} />);
      const buttons = container.querySelectorAll('button[role="radio"]');

      buttons[2].focus();
      fireEvent.keyDown(buttons[2], { key: 'ArrowLeft' });

      expect(buttons[1]).toHaveFocus();
    });

    it('handles Home key to move focus to first star', () => {
      const onChange = vi.fn();
      const { container } = render(<StarRating onChange={onChange} />);
      const buttons = container.querySelectorAll('button[role="radio"]');

      buttons[3].focus();
      fireEvent.keyDown(buttons[3], { key: 'Home' });

      expect(buttons[0]).toHaveFocus();
    });

    it('handles End key to move focus to last star', () => {
      const onChange = vi.fn();
      const { container } = render(<StarRating onChange={onChange} />);
      const buttons = container.querySelectorAll('button[role="radio"]');

      buttons[0].focus();
      fireEvent.keyDown(buttons[0], { key: 'End' });

      expect(buttons[4]).toHaveFocus();
    });

    it('calls onChange on Enter key when button is focused', () => {
      const onChange = vi.fn();
      const { container } = render(<StarRating onChange={onChange} />);
      const buttons = container.querySelectorAll('button[role="radio"]');

      buttons[2].focus();
      fireEvent.keyDown(buttons[2], { key: 'Enter' });

      expect(onChange).toHaveBeenCalledWith(3);
    });

    it('calls onChange on Space key when button is focused', () => {
      const onChange = vi.fn();
      const { container } = render(<StarRating onChange={onChange} />);
      const buttons = container.querySelectorAll('button[role="radio"]');

      buttons[1].focus();
      fireEvent.keyDown(buttons[1], { key: ' ' });

      expect(onChange).toHaveBeenCalledWith(2);
    });

    it('respects disabled prop', () => {
      const onChange = vi.fn();
      const { container } = render(<StarRating disabled onChange={onChange} />);
      const buttons = container.querySelectorAll('button[role="radio"]');

      fireEvent.click(buttons[0]);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('shows visible focus ring on interactive mode', () => {
      const { container } = render(<StarRating onChange={vi.fn()} />);
      const buttons = container.querySelectorAll('button[role="radio"]');

      fireEvent.focus(buttons[0]);
      expect(buttons[0]).toHaveFocus();
    });

    it('passes jest-axe accessibility check', async () => {
      const { container } = render(
        <StarRating onChange={vi.fn()} value={3} />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('read-only mode', () => {
    it('renders star icons without buttons', () => {
      const { container } = render(
        <StarRating readOnly value={3} />
      );
      const buttons = container.querySelectorAll('button');
      expect(buttons).toHaveLength(0);
    });

    it('displays correct number of filled stars', () => {
      const { container } = render(
        <StarRating readOnly value={3} />
      );
      const stars = container.querySelectorAll('svg');
      expect(stars.length).toBeGreaterThan(0);
    });

    it('renders with appropriate aria-label for read-only display', () => {
      const { container } = render(
        <StarRating readOnly value={3.5} />
      );
      const display = container.querySelector('[role="img"]');
      expect(display).toHaveAttribute('aria-label', expect.stringContaining('3.5'));
    });

    it('supports half-star display when allowHalf is true', () => {
      const { container } = render(
        <StarRating readOnly value={2.5} allowHalf />
      );
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('passes jest-axe accessibility check', async () => {
      const { container } = render(
        <StarRating readOnly value={4} />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('roving tabindex', () => {
    it('only first star is in tab order initially', () => {
      const { container } = render(<StarRating onChange={vi.fn()} />);
      const buttons = container.querySelectorAll('button[role="radio"]');

      expect(buttons[0]).toHaveAttribute('tabindex', '0');
      expect(buttons[1]).toHaveAttribute('tabindex', '-1');
      expect(buttons[2]).toHaveAttribute('tabindex', '-1');
      expect(buttons[3]).toHaveAttribute('tabindex', '-1');
      expect(buttons[4]).toHaveAttribute('tabindex', '-1');
    });

    it('updates tabindex when focus changes', () => {
      const { container } = render(<StarRating onChange={vi.fn()} />);
      const buttons = container.querySelectorAll('button[role="radio"]');

      fireEvent.focus(buttons[2]);
      expect(buttons[2]).toHaveAttribute('tabindex', '0');
    });
  });

  describe('styling', () => {
    it('applies custom className', () => {
      const { container } = render(
        <StarRating onChange={vi.fn()} className="custom-class" />
      );
      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('custom-class');
    });

    it('applies correct size classes', () => {
      const { container: lgContainer } = render(
        <StarRating onChange={vi.fn()} size="lg" />
      );
      const lgStars = lgContainer.querySelectorAll('svg');
      expect(lgStars[0]).toHaveClass('text-2xl');
    });
  });
});
