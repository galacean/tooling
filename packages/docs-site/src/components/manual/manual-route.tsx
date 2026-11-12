import { useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { isSupportedLocale, localePath } from '../../i18n';
import { createManualContentClient } from '../../manual';
import type { ManualContentClient } from '../../manual';
import { ManualPage } from './manual-page';
import type {
  ManualPageMessages,
  ManualNavigationPage,
  ManualDocument,
} from './manual-page';
import type { SiteShellOutletContext } from '../site/site-shell';

export interface ManualRouteProps<TLocale extends string> {
  baseURL: string;
  manualDataURL?: string;
  locales: readonly TLocale[];
  locale: TLocale;
  sectionLabel: string;
  messages: ManualPageMessages;
}

interface ManualRouteLoaders {
  loadNavigation: (locale: string) => Promise<ManualNavigationPage[]>;
  loadOverview: (locale: string) => Promise<ManualDocument>;
  loadPage: (locale: string, slug: string) => Promise<ManualDocument>;
}

export function ManualRoute<TLocale extends string>({
  baseURL,
  manualDataURL,
  locales,
  locale,
  sectionLabel,
  messages,
}: ManualRouteProps<TLocale>) {
  const { slug } = useParams();
  const { setManualPageTitle, setManualSidebarCollapsed } =
    useOutletContext<SiteShellOutletContext>();
  const [client] = useState(() =>
    createManualContentClient({
      baseURL,
      ...(manualDataURL === undefined ? {} : { manualDataURL }),
      locales,
    }),
  );
  const [loaders] = useState(() => createRouteLoaders(client, locales));

  return (
    <ManualPage
      locale={locale}
      slug={slug}
      messages={messages}
      onTitleChange={setManualPageTitle}
      onSidebarCollapsed={setManualSidebarCollapsed}
      sectionLabel={sectionLabel}
      homeHref={localePath(locale)}
      getPageHref={value =>
        localePath(locale, value === undefined ? ['manual'] : ['manual', value])
      }
      loadNavigation={loaders.loadNavigation}
      loadOverview={loaders.loadOverview}
      loadPage={loaders.loadPage}
    />
  );
}

function createRouteLoaders<TLocale extends string>(
  client: ManualContentClient<TLocale>,
  locales: readonly TLocale[],
): ManualRouteLoaders {
  function parseLocale(value: string): TLocale {
    if (!isSupportedLocale(value, locales)) {
      throw new Error(`Unknown manual locale: ${value}`);
    }

    return value;
  }

  return {
    async loadNavigation(locale) {
      const parsedLocale = parseLocale(locale);

      return client.manualPages(parsedLocale, await client.loadNavigation());
    },
    loadOverview(locale) {
      return client.loadOverview(parseLocale(locale));
    },
    async loadPage(locale, slug) {
      const parsedLocale = parseLocale(locale);

      return client.loadPage(parsedLocale, slug, await client.loadNavigation());
    },
  };
}
