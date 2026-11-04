import type { JSONOutput } from 'typedoc';
import type { Key, ReactNode } from 'react';
import {
  childrenOf,
  formatSignature,
  formatType,
  getAPICommentContent,
  isExternalInherited,
  resolveAPICommentLink,
  resolveAPIMarkdownLink,
  signaturesOf,
} from '../../data';
import type { APICommentContext, TypeToken } from '../../data';
import { APIComment, APISourceLinks } from './api-reflection-content';
import type { APICommentProps } from './api-reflection-content';
import { APIReflectionDetail } from './api-reflection-detail';
import type { APIReflectionDetailMessages } from './api-reflection-detail';
import { APIKindLabel } from './api-kind-label';
import { APITokens } from './api-tokens';
import { APITypeReference } from './api-type-reference';

export interface APITypeDocContext<
  TProject extends object,
  TReflection extends object,
  TLocale extends string,
> extends APICommentContext<TProject, TReflection> {
  locale: TLocale;
}

export interface APITypeDocDetailMessages
  extends
    APIReflectionDetailMessages,
    Pick<
      APICommentProps['messages'],
      'noDescription' | 'original' | 'copy' | 'copied' | 'copyFailed'
    > {
  definition: string;
  sourceType: string;
  source: string;
}

export interface APITypeDocDetailProps<
  TProject extends object,
  TReflection extends object,
  TLocale extends string,
> {
  reflection: TReflection;
  context: APITypeDocContext<TProject, TReflection, TLocale>;
  showInherited: boolean;
  messages: APITypeDocDetailMessages;
  isLocale: (value: unknown) => value is TLocale;
  getLocaleLabel: (locale: string) => string;
  getGroupLabel: (kind: number) => string;
  getRepositoryFileURL: (revision: string, filePath?: string) => string;
}

export function APITypeDocDetail<
  TProject extends object,
  TReflection extends object,
  TLocale extends string,
>({
  reflection,
  context,
  showInherited,
  messages: t,
  isLocale,
  getLocaleLabel,
  getGroupLabel,
  getRepositoryFileURL,
}: APITypeDocDetailProps<TProject, TReflection, TLocale>) {
  const renderKind = (kind: number, compact: boolean) => (
    <APIKindLabel kind={kind} label={getGroupLabel(kind)} compact={compact} />
  );

  function renderSource(sourceReflection: TReflection): ReactNode {
    const sourceValue =
      sourceReflection as unknown as JSONOutput.SomeReflection;
    const sources = 'sources' in sourceValue ? (sourceValue.sources ?? []) : [];

    return <APISourceLinks sources={sources} label={t.source} />;
  }

  function renderComment(
    target: TReflection,
    options?: { field?: string; empty?: boolean },
  ): ReactNode {
    const targetValue = target as unknown as JSONOutput.SomeReflection;
    const field = options?.field ?? 'summary';
    const content = getAPICommentContent<
      TLocale,
      JSONOutput.CommentDisplayPart
    >(targetValue, field, isLocale);
    const text = content?.parts
      .map(part => {
        const url = resolveAPICommentLink(part, context, getRepositoryFileURL);

        return url === undefined ? part.text : `[${part.text}](${url})`;
      })
      .join('');

    return (
      <APIComment
        text={text}
        locale={context.locale}
        sourceLocale={content?.sourceLocale}
        getLocaleLabel={getLocaleLabel}
        messages={t}
        empty={options?.empty ?? false}
        resolveLink={url =>
          resolveAPIMarkdownLink(url, target, context, getRepositoryFileURL)
        }
      />
    );
  }

  function renderTypeReference(
    reference: JSONOutput.ReferenceType,
    text: string,
    key: Key,
  ): ReactNode {
    const target = context.index.resolve(reference.target);
    const targetValue = target as unknown as
      JSONOutput.SomeReflection | undefined;
    const url =
      targetValue === undefined
        ? undefined
        : context.index.url(context.locale, context.version, targetValue.id);

    if (targetValue === undefined || url === undefined) {
      return (
        <APITypeReference
          key={key}
          text={text}
          {...(reference.externalUrl === undefined
            ? {}
            : { externalUrl: reference.externalUrl })}
          unresolvedTitle={`${t.sourceType}: ${reference.package ?? ''} ${
            reference.qualifiedName ?? reference.name
          }`}
        />
      );
    }
    const signatures =
      signaturesOf<JSONOutput.SignatureReflection>(targetValue);
    const summary =
      getAPICommentContent<TLocale, JSONOutput.CommentDisplayPart>(
        targetValue,
        'summary',
        isLocale,
      ) ??
      (signatures[0] === undefined
        ? undefined
        : getAPICommentContent<TLocale, JSONOutput.CommentDisplayPart>(
            signatures[0],
            'summary',
            isLocale,
          ));

    return (
      <APITypeReference
        key={key}
        text={text}
        {...(reference.externalUrl === undefined
          ? {}
          : { externalUrl: reference.externalUrl })}
        generic={reference.refersToTypeParameter === true}
        target={{
          name: targetValue.name,
          href: url,
          definitionLabel: t.definition,
          locale: context.locale,
          signatures: signatures.map(signature => formatSignature(signature)),
          ...('type' in targetValue && targetValue.type !== undefined
            ? { type: formatType(targetValue.type) }
            : {}),
          summary: summary?.parts.map(part => part.text).join('') ?? '',
          ...(summary?.sourceLocale === undefined
            ? {}
            : { sourceLocale: summary.sourceLocale }),
          originalLabel: t.original,
          noDescription: t.noDescription,
          members: childrenOf(targetValue).map(child => ({
            name: child.name,
            href:
              context.index.url(context.locale, context.version, child.id) ??
              url,
          })),
        }}
      />
    );
  }

  function renderTokens(tokens: TypeToken[]): ReactNode {
    return (
      <APITokens
        tokens={tokens}
        renderReference={(reference, text, key) =>
          renderTypeReference(reference as JSONOutput.ReferenceType, text, key)
        }
      />
    );
  }

  function renderType(type: unknown): ReactNode {
    return renderTokens(formatType(type));
  }

  return (
    <APIReflectionDetail<TReflection>
      reflection={reflection}
      showInherited={showInherited}
      messages={{
        contents: t.contents,
        overview: t.overview,
        signature: t.signature,
        description: t.description,
        parameters: t.parameters,
        returns: t.returns,
        extends: t.extends,
        implements: t.implements,
        generics: t.generics,
        deprecated: '@deprecated',
      }}
      getGroupLabel={getGroupLabel}
      renderKind={renderKind}
      renderSource={renderSource}
      renderComment={renderComment}
      renderType={renderType}
      renderTokens={renderTokens}
      isExternalInherited={member => isExternalInherited(member, context.index)}
    />
  );
}
