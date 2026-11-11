import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import type { TypeToken } from '../../data';
import { APITokens } from './api-tokens';

export interface APITypeReferenceTarget {
  name: string;
  href: string;
  definitionLabel: string;
  locale: string;
  signatures: TypeToken[][];
  type?: TypeToken[];
  summary: string;
  sourceLocale?: string;
  originalLabel: string;
  noDescription: string;
  members: { name: string; href: string }[];
}

export interface APITypeReferenceProps {
  text: string;
  externalUrl?: string;
  unresolvedTitle?: string;
  generic?: boolean;
  target?: APITypeReferenceTarget;
}

export function APITypeReference({
  text,
  externalUrl,
  unresolvedTitle,
  generic = false,
  target,
}: APITypeReferenceProps) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const contentRef = useRef<HTMLSpanElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number }>();

  const showPreview = () => {
    clearTimeout(closeTimerRef.current);
    setOpen(true);
  };

  const scheduleClose = () => {
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      const activeElement = document.activeElement;

      if (
        !wrapRef.current?.contains(activeElement) &&
        !contentRef.current?.contains(activeElement)
      ) {
        setOpen(false);
      }
    }, 100);
  };

  useEffect(() => {
    if (!open || externalUrl !== undefined || target === undefined) {
      return;
    }

    const updatePosition = () => {
      const wrap = wrapRef.current;
      const content = contentRef.current;

      if (wrap === null || content === null) {
        return;
      }

      const anchor = wrap.getBoundingClientRect();
      const { innerHeight, innerWidth } = window;
      const padding = 12;
      const gap = 8;
      const contentHeight = content.offsetHeight;
      const contentWidth = content.offsetWidth;
      const topSpace = anchor.top - gap - padding;
      const bottomSpace = innerHeight - anchor.bottom - gap - padding;
      const placeAbove = topSpace >= contentHeight || topSpace >= bottomSpace;
      const top = placeAbove
        ? anchor.top - gap - contentHeight
        : anchor.bottom + gap;
      const left = Math.min(
        Math.max(padding, anchor.left),
        innerWidth - contentWidth - padding,
      );

      setPosition({
        top: Math.max(
          padding,
          Math.min(top, innerHeight - contentHeight - padding),
        ),
        left,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, externalUrl, target]);

  useEffect(() => () => clearTimeout(closeTimerRef.current), []);

  if (externalUrl !== undefined) {
    return (
      <a
        className="signature-type"
        href={externalUrl}
        target="_blank"
        rel="noreferrer"
      >
        {text}
      </a>
    );
  }
  if (target === undefined) {
    return (
      <span className="signature-type" title={unresolvedTitle}>
        {text}
      </span>
    );
  }

  const preview = (
    <span
      ref={contentRef}
      className={`api-reference-content docs-scroll-area${open ? ' is-open' : ''}`}
      style={
        position === undefined
          ? { visibility: 'hidden' }
          : { top: position.top, left: position.left }
      }
      role="group"
      aria-label={`${target.name} ${target.definitionLabel}`}
      onPointerEnter={showPreview}
      onPointerLeave={scheduleClose}
      onFocus={showPreview}
      onBlur={scheduleClose}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          setOpen(false);
        }
      }}
    >
      <span className="api-reference-header">
        <strong>{target.name}</strong>
        <Link to={target.href}>{target.definitionLabel} ↗</Link>
      </span>
      {target.signatures.map((tokens, index) => (
        <APITokens key={index} tokens={tokens} />
      ))}
      {target.type !== undefined && <APITokens tokens={target.type} />}
      <span className="api-reference-summary">
        {target.summary || target.noDescription}
      </span>
      {target.sourceLocale !== undefined &&
        target.sourceLocale !== target.locale && (
          <small>
            {target.originalLabel}: {target.sourceLocale}
          </small>
        )}
      <span className="api-reference-members docs-scroll-area">
        {target.members.map(member => (
          <Link key={member.name} to={member.href}>
            {member.name}
          </Link>
        ))}
      </span>
    </span>
  );

  return (
    <span ref={wrapRef} className="api-reference-wrap">
      <button
        className={`${generic ? 'signature-generic' : 'signature-type'} type-reference`}
        type="button"
        onPointerEnter={showPreview}
        onPointerLeave={scheduleClose}
        onFocus={showPreview}
        onBlur={scheduleClose}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
      >
        {text}
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(preview, document.body)
        : preview}
    </span>
  );
}
