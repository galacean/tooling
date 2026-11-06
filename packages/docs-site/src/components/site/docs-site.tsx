import { lazy, useState } from 'react';
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
import { DocumentError } from '../shared';
import { SiteShell } from './site-shell';
import type { ManualPageMessages } from '../manual';
import type { CommonSiteMessages } from '../../i18n';

const ManualRoute = lazy(async () => {
  const module = await import('../manual/manual-route.js');

  return { default: module.ManualRoute };
});
const ConfiguredAPIPage = lazy(async () => {
  const module = await import('../api/configured-api-page.js');

  return { default: module.ConfiguredAPIPage };
});

export type DocsSiteMessages = CommonSiteMessages &
  Pick<ManualPageMessages, 'manualIntro'>;

export interface DocsSiteConfiguration<TLocale extends string> {
  brandLabel: string;
  brandMarkUrls: Readonly<{ light: string; dark: string }>;
  githubHref?: string;
  historyKeyPrefix: string;
  localeLabels: Readonly<Record<TLocale, string>>;
  messages: (locale: TLocale) => DocsSiteMessages;
  manualSectionLabel: string;
  manualArticleMeta?: ReactNode;
  api: import('../api/configured-api-page').DocsSiteAPIConfiguration;
  siteOrigin?: string;
  getSearchDataURL?: (locale: TLocale) => string;
}

export interface DocsSiteProps<TLocale extends string> {
  baseURL: string;
  locales: readonly TLocale[];
  defaultLocale: TLocale;
  preferenceNamespace: string;
  site: DocsSiteConfiguration<TLocale>;
  renderHome: (locale: TLocale) => ReactNode;
}

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
}: {
  baseURL: string;
  locales: readonly TLocale[];
  locale: TLocale;
  site: DocsSiteConfiguration<TLocale>;
}) {
  const location = useLocation();
  const messages = site.messages(locale);
  const section = location.pathname.split('/')[2];
  const pageKind =
    section === 'api' || section === 'manual' ? section : 'other';
  const origin = site.siteOrigin ?? window.location.origin;
  const absoluteURL = (pathname: string) =>
    new URL(withBase(pathname, normalizeBase(baseURL)), origin).href;
  const languageOptions = locales.map(value => ({
    value,
    label: site.localeLabels[value],
  }));
  const loadSearchItems = async (searchLocale: string) => {
    if (!isSupportedLocale(searchLocale, locales)) {
      throw new Error(`Unknown search locale: ${searchLocale}`);
    }
    const url =
      site.getSearchDataURL?.(searchLocale) ??
      `${baseURL}data/search/${searchLocale}.json`;

    return parseSearch(await loadJSON(url), locales);
  };

  return (
    <SiteShell
      locale={locale}
      locales={languageOptions}
      messages={messages}
      brandLabel={site.brandLabel}
      brandMarkUrls={site.brandMarkUrls}
      homeHref={localePath(locale)}
      navigation={(['home', 'manual', 'api'] as const).map(page => ({
        key: page,
        label: messages[page],
        to: localePath(locale, page === 'home' ? [] : [page]),
        end: page === 'home',
      }))}
      {...(site.githubHref === undefined
        ? {}
        : { githubHref: site.githubHref })}
      historyKeyPrefix={site.historyKeyPrefix}
      pageKind={pageKind}
      pageTitle={
        pageKind === 'api'
          ? (location.pathname.split('/').filter(Boolean).at(-1) ?? 'API')
          : ''
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
  locales,
  defaultLocale,
  preferenceNamespace,
  site,
  renderHome,
}: DocsSiteProps<TLocale>) {
  const [getPreferredLocale] = useState(() =>
    createBrowserLocalePreference(locales, defaultLocale, preferenceNamespace),
  );
  const basename = normalizeBase(baseURL).replace(/\/$/u, '') || '/';

  return (
    <ThemeProvider namespace={preferenceNamespace}>
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
                  site={site}
                ></ConfiguredSiteShell>
              }
            >
              <Route index element={renderHome(locale)} />
              <Route
                path="api"
                element={
                  <ConfiguredAPIPage
                    baseURL={baseURL}
                    locales={locales}
                    locale={locale}
                    messages={site.messages(locale)}
                    localeLabels={site.localeLabels}
                    api={site.api}
                  />
                }
              />
              <Route
                path="api/:pkg"
                element={
                  <ConfiguredAPIPage
                    baseURL={baseURL}
                    locales={locales}
                    locale={locale}
                    messages={site.messages(locale)}
                    localeLabels={site.localeLabels}
                    api={site.api}
                  />
                }
              />
              <Route
                path="api/:pkg/:version/:symbol"
                element={
                  <ConfiguredAPIPage
                    baseURL={baseURL}
                    locales={locales}
                    locale={locale}
                    messages={site.messages(locale)}
                    localeLabels={site.localeLabels}
                    api={site.api}
                  />
                }
              />
              <Route
                path="manual/:slug?"
                element={
                  <ManualRoute
                    baseURL={baseURL}
                    locales={locales}
                    locale={locale}
                    sectionLabel={site.manualSectionLabel}
                    messages={site.messages(locale)}
                    {...(site.manualArticleMeta === undefined
                      ? {}
                      : { articleMeta: site.manualArticleMeta })}
                  />
                }
              />
              <Route
                path="*"
                element={
                  <NotFound locale={locale} messages={site.messages(locale)} />
                }
              />
            </Route>
          ))}
          <Route
            path="*"
            element={
              <NotFound
                locale={defaultLocale}
                messages={site.messages(defaultLocale)}
              />
            }
          />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
