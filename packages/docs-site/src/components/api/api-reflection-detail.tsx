import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { JSONOutput } from 'typedoc';
import {
  childrenOf, formatGenerics, formatSignature, isDeclaration, signaturesOf,
} from '../../data';
import type { TypeToken } from '../../data';
import { apiKindGroup } from './api-kind-label';
import { APIDescriptionList, APISignaturePanel } from './api-reflection-content';
import { APIReflectionLayout, APIReflectionSections } from './api-reflection-layout';

export interface APIReflectionDetailMessages {
  overview: string;
  signature: string;
  description: string;
  parameters: string;
  returns: string;
  extends: string;
  implements: string;
  generics: string;
  deprecated: string;
}

export interface APIReflectionDetailProps<TReflection extends object> {
  reflection: TReflection;
  showInherited: boolean;
  messages: APIReflectionDetailMessages;
  getGroupLabel: (kind: number) => string;
  renderKind: (kind: number, compact: boolean) => ReactNode;
  renderSource: (reflection: TReflection) => ReactNode;
  renderComment: (
    reflection: TReflection,
    options?: { field?: string; empty?: boolean },
  ) => ReactNode;
  renderType: (type: unknown) => ReactNode;
  renderTokens: (tokens: TypeToken[]) => ReactNode;
  isExternalInherited: (reflection: TReflection) => boolean;
}

export function APIReflectionDetail<TReflection extends object> ({
  reflection,
  showInherited,
  messages: t,
  getGroupLabel,
  renderKind,
  renderSource,
  renderComment,
  renderType,
  renderTokens,
  isExternalInherited,
}: APIReflectionDetailProps<TReflection>) {
  const location = useLocation();
  const value = reflection as unknown as JSONOutput.SomeReflection;
  const members = childrenOf<JSONOutput.SomeReflection>(value).filter(
    member =>
      showInherited || !isExternalInherited(member as unknown as TReflection),
  );
  const groups = new Map<string, typeof members>();
  const genericParameters =
    'typeParameters' in value
      ? (value.typeParameters as
        | JSONOutput.TypeParameterReflection[]
        | undefined)
      : undefined;
  const signatures = signaturesOf<JSONOutput.SignatureReflection>(reflection);
  const comment = value.comment ?? signatures[0]?.comment;
  const groupName = (kind: number) => getGroupLabel(kind);
  const anchorHref = (name: string) =>
    `${location.pathname}${location.search}#${encodeURIComponent(name)}`;

  for (const member of members) {
    const title = groupName(member.kind);

    groups.set(title, [...(groups.get(title) ?? []), member]);
  }

  function SignatureDetail ({
    signature,
  }: {
    signature: JSONOutput.SignatureReflection;
  }) {
    const signatureReflection = signature as unknown as TReflection;

    return (
      <APISignaturePanel
        items={[
          {
            key: 'signature',
            label: t.signature,
            content: (
              <>
                {renderTokens(formatSignature(signature))}
                {renderSource(signatureReflection)}
              </>
            ),
          },
          {
            key: 'description',
            label: t.description,
            content: (
              <>
                {renderComment(signatureReflection, { empty: true })}
                {(signature.comment?.blockTags ?? []).map((tag, index) => (
                  <div key={index}>
                    <span className="api-tag blue">{tag.tag}</span>
                    {renderComment(signatureReflection, {
                      field: `${tag.tag}:${tag.name ?? ''}:${index}`,
                    })}
                  </div>
                ))}
              </>
            ),
          },
          ...(signature.parameters ?? []).map(parameter => ({
            key: parameter.id,
            label: t.parameters,
            content: (
              <>
                <code className="api-parameter-name">
                  {parameter.name}
                  {parameter.flags.isOptional === true ? '?' : ''}
                </code>
                {': '}
                {renderType(parameter.type)}
                {renderComment(parameter as unknown as TReflection)}
              </>
            ),
          })),
          {
            key: 'returns',
            label: t.returns,
            content: renderType(signature.type),
          },
        ]}
      />
    );
  }

  return (
    <APIReflectionLayout>
      <div className="api-title" id={value.name}>
        <Link to={anchorHref(value.name)} className="anchor-link">
          #
        </Link>
        {renderKind(value.kind, false)}
        <h1>
          {value.name}
          {genericParameters !== undefined &&
            renderTokens(formatGenerics(genericParameters))}
        </h1>
        {renderSource(reflection)}
        {comment?.blockTags?.some(tag => tag.tag === '@deprecated') ===
          true && <span className="api-tag red">{t.deprecated}</span>}
      </div>
      {isDeclaration(value) &&
        (value.extendedTypes !== undefined ||
          value.implementedTypes !== undefined) && (
          <APIDescriptionList
            items={[
              ...(value.extendedTypes === undefined
                ? []
                : [
                  {
                    key: 'extends',
                    label: t.extends,
                    content: value.extendedTypes.map((type, index) => (
                      <span key={index}>{renderType(type)}</span>
                    )),
                  },
                ]),
              ...(value.implementedTypes === undefined
                ? []
                : [
                  {
                    key: 'implements',
                    label: t.implements,
                    content: value.implementedTypes.map((type, index) => (
                      <span key={index}>{renderType(type)}</span>
                    )),
                  },
                ]),
            ]}
          />
        )}
      {genericParameters !== undefined && genericParameters.length > 0 && (
        <div>
          <h3>{t.generics}</h3>
          {genericParameters.map(parameter => (
            <div key={parameter.id} id={`${value.name}.${parameter.name}`}>
              <strong>{parameter.name}</strong>
              {'type' in parameter && parameter.type !== undefined && (
                <>
                  {' extends '}
                  {renderType(parameter.type)}
                </>
              )}
              {renderComment(parameter as unknown as TReflection)}
            </div>
          ))}
        </div>
      )}
      {renderComment(reflection, { empty: signatures.length === 0 })}
      {(value.comment?.blockTags ?? []).map((tag, index) => (
        <div key={index}>
          <span className="api-tag blue">{tag.tag}</span>
          {renderComment(reflection, {
            field: `${tag.tag}:${tag.name ?? ''}:${index}`,
          })}
        </div>
      ))}
      {signatures.map(signature => (
        <SignatureDetail key={signature.id} signature={signature} />
      ))}
      {signatures.length === 0 &&
        'type' in value &&
        value.type !== undefined && (
          <APISignaturePanel
            items={[
              {
                key: 'type',
                label: t.signature,
                content: renderType(value.type),
              },
            ]}
          />
        )}
      <APIReflectionSections
        overviewLabel={t.overview}
        reflectionLabel={
          <>
            {renderKind(value.kind, true)} {value.name}
          </>
        }
        groups={[...groups].map(([label, groupMembers]) => ({
          id: `api-group-${apiKindGroup(groupMembers[0]?.kind ?? 0)}`,
          label,
          members: groupMembers.map(member => {
            const memberReflection = member as unknown as TReflection;
            const memberValue = member;
            const memberSignatures =
              signaturesOf<JSONOutput.SignatureReflection>(member);

            return {
              id: String(member.id),
              name: member.name,
              href: anchorHref(member.name),
              kindLabel: renderKind(member.kind, true),
              optional: member.flags.isOptional === true,
              headerContent: (
                <>
                  {renderSource(memberReflection)}
                  {Object.entries(member.flags)
                    .filter(([, enabled]) => enabled === true)
                    .map(([flag]) => (
                      <span key={flag} className="api-tag">
                        {flag.replace(/^is/u, '').toLowerCase()}
                      </span>
                    ))}
                </>
              ),
              children: (
                <>
                  {renderComment(memberReflection)}
                  {memberSignatures.length > 0 ? (
                    memberSignatures.map(signature => (
                      <SignatureDetail
                        key={signature.id}
                        signature={signature}
                      />
                    ))
                  ) : (
                    <APISignaturePanel
                      items={[
                        {
                          key: 'type',
                          label: t.signature,
                          content: renderType(
                            'type' in memberValue
                              ? memberValue.type
                              : undefined,
                          ),
                        },
                      ]}
                    />
                  )}
                </>
              ),
            };
          }),
        }))}
      />
    </APIReflectionLayout>
  );
}
