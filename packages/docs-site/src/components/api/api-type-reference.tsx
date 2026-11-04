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

  return (
    <span className="api-reference-wrap">
      <button
        className={`${generic ? 'signature-generic' : 'signature-type'} type-reference`}
        type="button"
      >
        {text}
      </button>
      <span
        className="api-reference-content"
        role="group"
        aria-label={`${target.name} ${target.definitionLabel}`}
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
        <span className="api-reference-members">
          {target.members.map(member => (
            <Link key={member.name} to={member.href}>
              {member.name}
            </Link>
          ))}
        </span>
      </span>
    </span>
  );
}
