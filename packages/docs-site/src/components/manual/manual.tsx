import type { ManualSource } from '../../manual/source';
import type { DocsNavigation } from '../../routing/navigation';
import type { ManualTarget } from '../../routing/targets';
import { usePageEnvironment } from '../../providers/page';
import { ManualPage } from './manual-page';
import type { CommonSiteMessages } from '../../i18n/messages';

export interface ManualProps {
  source: ManualSource;
  locale?: string;
  slug?: string | undefined;
  href: (target: ManualTarget) => string;
  messages?: Partial<CommonSiteMessages>;
  navigation?: DocsNavigation;
}

export function Manual({
  source,
  href,
  locale: language,
  messages: overrides,
  navigation,
  slug,
}: ManualProps) {
  const { locale, messages, shell } = usePageEnvironment(language, overrides);

  return (
    <ManualPage
      {...source}
      locale={locale}
      messages={messages}
      slug={slug}
      navigation={navigation}
      getPageHref={(slug, anchor) => href({ kind: 'manual', locale, slug, anchor })}
      onTitleChange={shell?.setTitle}
      onContentLocalesChange={shell?.setContentLocales}
      onSidebarCollapsed={shell?.setSidebarCollapsed}
    />
  );
}
