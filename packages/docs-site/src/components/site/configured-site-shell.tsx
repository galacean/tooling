import { matchPath, useLocation } from 'react-router-dom';
import type { DocsSitePage, ResolvedDocsSiteOptions } from '../../config/types';
import { loadJSON } from '../../data';
import { isSupportedLocale, localePath, switchLocale, withBase } from '../../i18n';
import { parseSearch } from '../../search';
import { DocumentError } from '../shared';
import { SiteShell } from './site-shell';

export function ConfiguredSiteShell<TLocale extends string>({
  locale,
  config,
  pages,
}: {
  locale: TLocale;
  config: ResolvedDocsSiteOptions<TLocale>;
  pages: readonly DocsSitePage<TLocale>[];
}) {
  const { baseURL, locales } = config;
  const location = useLocation();
  const messages = config.messages(locale);
  const pathSegments = location.pathname.split('/').filter(Boolean);
  const section = pathSegments[1];
  const sitePage = pages.find(page =>
    matchPath(
      page.slug === null ? `/${locale}` : `/${locale}/${page.slug}`,
      location.pathname,
    ),
  );
  const pageKind =
    section === 'api' && config.api !== undefined ? 'api' :
      section === 'manual' && config.manual !== false ? 'manual' :
        sitePage === undefined ? 'not-found' : 'other';
  const absoluteURL = (pathname: string) =>
    new URL(
      withBase(pathname, baseURL),
      config.siteOrigin,
    ).href;
  const getLocaleHref = (language: string, search: string, hash: string) => {
    if (!isSupportedLocale(language, locales)) {
      throw new Error(`Unknown site locale: ${language}`);
    }

    return switchLocale(location.pathname, language, search, hash);
  };
  const languageOptions = locales.map(value => ({
    value,
    label: config.localeLabels[value],
  }));
  const loadSearchItems = async (searchLocale: string) => {
    if (!isSupportedLocale(searchLocale, locales)) {
      throw new Error(`Unknown search locale: ${searchLocale}`);
    }
    const url = config.getSearchDataURL(searchLocale);

    return parseSearch(await loadJSON(url), locales);
  };
  const navigationPages: ('home' | 'manual' | 'api')[] = ['home'];

  if (config.manual !== false) {
    navigationPages.push('manual');
  }
  if (config.api !== undefined) {
    navigationPages.push('api');
  }
  const navigation = [
    ...navigationPages.map(page => ({
      key: page,
      label: messages[page],
      to: page === 'home' ? config.homeHref : localePath(locale, [page]),
      end: page === 'home',
    })),
    ...pages.flatMap(page =>
      page.slug === null
        ? []
        : [
            {
              key: `site-page:${page.slug}`,
              label: page.title[locale],
              to: localePath(locale, [page.slug]),
              ...(page.icon === undefined ? {} : { icon: page.icon }),
            },
          ],
    ),
  ];

  return (
    <SiteShell
      locale={locale}
      locales={languageOptions}
      messages={messages}
      brandLabel={config.brandLabel}
      brandMarkURLs={config.brandMarkURLs}
      docsBrandMarkURLs={config.docsBrandMarkURLs}
      homeHref={config.homeHref}
      storageKeys={config.storageKeys}
      navigation={navigation}
      {...(config.githubHref === undefined
        ? {}
        : { githubHref: config.githubHref })}
      pageKind={pageKind}
      pageTitle={
        pageKind === 'api'
          ? (pathSegments.at(-1) ?? 'API')
          : sitePage === undefined || sitePage.slug === null
            ? ''
            : sitePage.title[locale]
      }
      canonicalHref={absoluteURL(location.pathname)}
      getAlternateHref={language => absoluteURL(getLocaleHref(language, '', ''))}
      getLocaleHref={getLocaleHref}
      loadSearchItems={loadSearchItems}
      errorFallback={() => (
        <DocumentError
          title={messages.loadError}
          description={messages.loadErrorDescription}
          layout="page"
        />
      )}
      searchErrorFallback={() => (
        <DocumentError
          title={messages.loadError}
          description={messages.loadErrorDescription}
        />
      )}
    />
  );
}
