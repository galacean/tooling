import { useEffect, useRef, useState } from 'react';

export function CopyButton({
  value,
  label,
  success,
  failure,
}: {
  value: string | (() => string);
  label: string;
  success: string;
  failure: string;
}) {
  const [feedback, setFeedback] = useState('');
  const timer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (timer.current !== undefined) {
        window.clearTimeout(timer.current);
      }
    },
    [],
  );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        typeof value === 'string' ? value : value(),
      );
      setFeedback(success);
    } catch {
      setFeedback(failure);
    }
    if (timer.current !== undefined) {
      window.clearTimeout(timer.current);
    }
    timer.current = window.setTimeout(() => setFeedback(''), 2200);
  };

  return (
    <span className="copy-control">
      <button
        type="button"
        className="copy-button icon-action"
        aria-label={label}
        title={label}
        onClick={() => {
          void copy();
        }}
      >
        <span aria-hidden="true">⧉</span>
      </button>
      <span className="copy-feedback" role="status" aria-live="polite">
        {feedback}
      </span>
    </span>
  );
}
