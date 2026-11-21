import { Fragment, useState, useCallback, useRef } from "react";
import { FaRegStar, FaStar, FaStarHalf } from "react-icons/fa";

export default function StarRating({
  value = 0,
  onChange,
  readOnly = false,
  className = "",
  disabled = false,
  size = "md",
  allowHalf = false,
}) {
  const sizeClasses = {
    sm: "text-base",
    md: "text-xl",
    lg: "text-2xl",
  };

  const [focusedIndex, setFocusedIndex] = useState(-1);
  const buttonRefs = useRef([]);

  const handleKeyDown = useCallback((e, index) => {
    if (readOnly || disabled) return;

    let nextIndex = index;

    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = Math.min(index + 1, 4);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = Math.max(index - 1, 0);
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = 4;
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onChange?.(index + 1);
      return;
    }

    if (nextIndex !== index) {
      setFocusedIndex(nextIndex);
      buttonRefs.current[nextIndex]?.focus();
    }
  }, [readOnly, disabled, onChange]);

  const handleClick = useCallback((star) => {
    onChange?.(star);
  }, [onChange]);

  const renderReadOnlyMode = () => (
    <div
      className={['flex items-center gap-1', className].join(' ')}
      role="img"
      aria-label={`${Math.round(value * 10) / 10} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const isFull = value >= star;
        const isHalf = allowHalf && value >= star - 0.5 && value < star;
        const icon = isFull ? (
          <FaStar className={[sizeClasses[size] || sizeClasses.md, 'text-amber-500'].join(' ')} />
        ) : isHalf ? (
          <FaStarHalf className={[sizeClasses[size] || sizeClasses.md, 'text-amber-500'].join(' ')} />
        ) : (
          <FaRegStar className={[sizeClasses[size] || sizeClasses.md, 'text-slate-300'].join(' ')} />
        );
        return <Fragment key={star}>{icon}</Fragment>;
      })}
    </div>
  );

  const renderInteractiveMode = () => (
    <div
      className={['flex items-center gap-1', className].join(' ')}
      role="radiogroup"
      aria-label="Rating"
    >
      {[1, 2, 3, 4, 5].map((star, index) => {
        const selected = value >= star;
        const isFocused = focusedIndex === index;
        const iconProps = {
          className: [
            sizeClasses[size] || sizeClasses.md,
            selected ? 'text-amber-500' : 'text-slate-300',
            'cursor-pointer transition-transform',
          ].join(' '),
        };

        const starNode = selected ? <FaStar {...iconProps} /> : <FaRegStar {...iconProps} />;

        return (
          <button
            key={star}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            disabled={disabled}
            onClick={() => handleClick(star)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            onFocus={() => setFocusedIndex(index)}
            onBlur={() => setFocusedIndex(-1)}
            className={[
              'rounded-full p-1.5 transition-all focus:outline-none disabled:cursor-not-allowed disabled:opacity-60',
              isFocused
                ? 'ring-2 ring-offset-2 ring-amber-500 dark:ring-offset-slate-900 ring-amber-400'
                : 'focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 dark:focus:ring-offset-slate-900',
              'dark:focus:ring-amber-400 hover:scale-110',
            ].join(' ')}
            role="radio"
            aria-checked={selected}
            aria-label={`${star} star${star === 1 ? "" : "s"}`}
            tabIndex={isFocused ? 0 : index === 0 ? 0 : -1}
          >
            {starNode}
          </button>
        );
      })}
    </div>
  );

  return readOnly ? renderReadOnlyMode() : renderInteractiveMode();
}
