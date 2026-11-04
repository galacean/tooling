import type { Key, ReactNode } from 'react';
import type { TypeToken } from '../../data';

export interface APITokensProps {
  tokens: TypeToken[];
  renderReference?: (reference: unknown, text: string, key: Key) => ReactNode;
}

export function APITokens({ tokens, renderReference }: APITokensProps) {
  return (
    <code className="api-signature">
      {tokens.map((part, index) =>
        part.reference === undefined || renderReference === undefined ? (
          <span key={index} className={`signature-${part.role}`}>
            {part.text}
          </span>
        ) : (
          renderReference(part.reference, part.text, index)
        ),
      )}
    </code>
  );
}
