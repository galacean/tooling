import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { loadJSON } from '../../data';
import { parseSearch } from '../../search';
import {
  createBrowserLocalePreference,
  isSupportedLocale,
  localePath,
  normalizeBase,
  switchLocale,
  withBase,
} from '../../i18n';
import { ThemeProvider } from '../../providers';
import { resolveDocsSiteConfiguration } from './default-docs-site-config';
import type {
  DocsSiteConfiguration,
  DocsSiteMessages,
  ResolvedDocsSiteConfiguration,
} from './default-docs-site-config';
import { DocumentError } from '../shared';
import type { IconName } from '../shared/icon';
import { lazyComponent } from '../shared/lazy-component';
import { SiteShell } from './site-shell';
import type { CommonSiteMessages } from '../../i18n';

const ManualRoute = lazyComponent(() =>
  import('../manual/manual-route.js').then(module => module.ManualRoute),
);
const ConfiguredAPIPage = lazyComponent(() =>
  import('../api/configured-api-page.js').then(
    module => module.ConfiguredAPIPage,
  ),
);

export type { DocsSiteConfiguration, DocsSiteMessages };

export interface DocsSiteProps<TLocale extends string> {
  baseURL: string;
  dataBaseURL?: string;
  locales: readonly TLocale[];
  defaultLocale: TLocale;
  site: DocsSiteConfiguration<TLocale>;
  pages: readonly DocsSitePage<TLocale>[];
}

export type DocsSitePageConfig<
  TLocale extends string,
  TIcon extends string = IconName,
> =
  | { slug: null; icon?: TIcon }
  | {
      slug: string;
      title: Readonly<Record<TLocale, string>>;
      icon?: TIcon;
    };

export type DocsSitePage<TLocale extends string> =
  | { slug: null; icon?: IconName; render: (locale: TLocale) => ReactNode }
  | {
      slug: string;
      title: (locale: TLocale) => string;
      icon?: IconName;
      render: (locale: TLocale) => ReactNode;
    };

function LocaleRedirect({
  getPreferredLocale,
}: {
  getPreferredLocale: () => string;
}) {
  const [locale] = useState(getPreferredLocale);
  const { search, hash } = useLocation();

  return <Navigate replace to={{ pathname: `/${locale}/`, search, hash }} />;
}

function NotFound({
  locale,
  messages,
}: {
  locale: string;
  messages: CommonSiteMessages;
}) {
  return (
    <main className="state-page">
      <h1>404 · {messages.notFound}</h1>
      <Link to={localePath(locale)}>{messages.backHome}</Link>
    </main>
  );
}

function ConfiguredSiteShell<TLocale extends string>({
  baseURL,
  locales,
  locale,
  site,
  pages,
}: {
  baseURL: string;
  locales: readonly TLocale[];
  locale: TLocale;
  site: ResolvedDocsSiteConfiguration<TLocale>;
  pages: readonly DocsSitePage<TLocale>[];
}) {
  const location = useLocation();
  const messages = site.messages(locale);
  const pathSegments = location.pathname.split('/').filter(Boolean);
  const section = pathSegments[1];
  const sitePage = pages.find(page => page.slug === (section ?? null));
  const pageKind =
    section === 'api' || section === 'manual' ? section : 'other';
  const absoluteURL = (pathname: string) =>
    new URL(
      withBase(pathname, normalizeBase(baseURL)),
      site.siteOrigin,
    ).href;
  const languageOptions = locales.map(value => ({
    value,
    label: site.localeLabels[value],
  }));
  const loadSearchItems = async (searchLocale: string) => {
    if (!isSupportedLocale(searchLocale, locales)) {
      throw new Error(`Unknown search locale: ${searchLocale}`);
    }
    const url = site.getSearchDataURL(searchLocale);

    return parseSearch(await loadJSON(url), locales);
  };
  const api = site.api;
  const navigationPages =
    api === undefined
      ? (['home', 'manual'] as const)
      : (['home', 'manual', 'api'] as const);
  const navigation = [
    ...navigationPages.map(page => ({
      key: page,
      label: messages[page],
      to: localePath(locale, page === 'home' ? [] : [page]),
      end: page === 'home',
    })),
    ...pages.flatMap(page =>
      page.slug === null
        ? []
        : [
            {
              key: `site-page:${page.slug}`,
              label: page.title(locale),
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
      brandLabel={site.brandLabel}
      brandMarkUrls={site.brandMarkUrls}
      docsBrandMarkUrls={site.docsBrandMarkUrls}
      homeHref={site.getHomeHref(locale)}
      storageKeys={site.storageKeys}
      navigation={navigation}
      {...(site.githubHref === undefined
        ? {}
        : { githubHref: site.githubHref })}
      pageKind={pageKind}
      pageTitle={
        pageKind === 'api'
          ? (location.pathname.split('/').filter(Boolean).at(-1) ?? 'API')
          : sitePage === undefined || sitePage.slug === null
            ? ''
            : sitePage.title(locale)
      }
      canonicalHref={absoluteURL(location.pathname)}
      getAlternateHref={language => {
        if (!isSupportedLocale(language, locales)) {
          throw new Error(`Unknown site locale: ${language}`);
        }

        return absoluteURL(switchLocale(location.pathname, language, '', ''));
      }}
      getLocaleHref={(language, search, hash) => {
        if (!isSupportedLocale(language, locales)) {
          throw new Error(`Unknown site locale: ${language}`);
        }

        return switchLocale(location.pathname, language, search, hash);
      }}
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

export function DocsSite<TLocale extends string>({
  baseURL,
  dataBaseURL,
  locales,
  defaultLocale,
  site,
  pages,
}: DocsSiteProps<TLocale>) {
  const resolvedSite = resolveDocsSiteConfiguration(site, baseURL, dataBaseURL);
  const [getPreferredLocale] = useState(() =>
    createBrowserLocalePreference(
      locales,
      defaultLocale,
      resolvedSite.storageKeys.locale,
    ),
  );
  const basename = normalizeBase(baseURL).replace(/\/$/u, '') || '/';
  const api = resolvedSite.api;
  const homePage = pages.find(page => page.slug === null);

  if (homePage === undefined) {
    throw new Error('DocsSite requires a page with a null slug for the locale home route');
  }

  return (
    <ThemeProvider
      themeStorageKey={resolvedSite.storageKeys.theme}
    >
      <BrowserRouter basename={basename}>
        <Routes>
          <Route
            path="/"
            element={<LocaleRedirect getPreferredLocale={getPreferredLocale} />}
          />
          {locales.map(locale => (
            <Route
              key={locale}
              path={`/${locale}`}
              element={
                <ConfiguredSiteShell
                  baseURL={baseURL}
                  locales={locales}
                  locale={locale}
                  site={resolvedSite}
                  pages={pages}
                ></ConfiguredSiteShell>
              }
            >
              <Route index element={homePage.render(locale)} />
              {api !== undefined &&
                (['api', 'api/:pkg', 'api/:pkg/:version/:symbol'] as const).map(
                  path => (
                    <Route
                      key={path}
                      path={path}
                      element={
                        <ConfiguredAPIPage
                          baseURL={resolvedSite.dataBaseURL}
                          locales={locales}
                          locale={locale}
                          messages={resolvedSite.messages(locale)}
                          localeLabels={resolvedSite.localeLabels}
                          api={api}
                        />
                      }
                    />
                  ),
                )}
              {(['manual', 'manual/:slug'] as const).map(path => (
                <Route
                  key={path}
                  path={path}
                  element={
                    <ManualRoute
                      baseURL={resolvedSite.dataBaseURL}
                      manualDataURL={resolvedSite.manualDataURL}
                      locales={locales}
                      locale={locale}
                      messages={resolvedSite.messages(locale)}
                    />
                  }
                />
              ))}
              {pages.map(page =>
                page.slug === null ? null : (
                  <Route
                    key={page.slug}
                    path={page.slug}
                    element={page.render(locale)}
                  />
                ),
              )}
              <Route
                path="*"
                element={
                  <NotFound
                    locale={locale}
                    messages={resolvedSite.messages(locale)}
                  />
                }
              />
            </Route>
          ))}
          <Route
            path="*"
            element={
              <NotFound
                locale={defaultLocale}
                messages={resolvedSite.messages(defaultLocale)}
              />
            }
          />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
