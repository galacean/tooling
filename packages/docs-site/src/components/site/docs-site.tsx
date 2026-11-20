import { useState } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { createBrowserLocalePreference } from '../../i18n';
import { ThemeProvider } from '../../providers';
import { resolveDocsSiteOptions } from '../../config/resolve';
import type { DocsSiteOptions, DocsSitePage } from '../../config/types';
import { lazyComponent } from '../shared/lazy-component';
import { ConfiguredSiteShell } from './configured-site-shell';
import { SiteLink } from './site-link';
import type { CommonSiteMessages } from '../../i18n';

const ManualRoute = lazyComponent(() =>
  import('../manual/manual-route.js').then(module => module.ManualRoute),
);
const ConfiguredAPIPage = lazyComponent(() =>
  import('../api/configured-api-page.js').then(
    module => module.ConfiguredAPIPage,
  ),
);

export interface DocsSiteProps<TLocale extends string> {
  config: DocsSiteOptions<TLocale>;
  pages: readonly DocsSitePage<TLocale>[];
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
  homeHref,
  messages,
}: {
  homeHref: string;
  messages: CommonSiteMessages;
}) {
  return (
    <main className="state-page">
      <h1>404 · {messages.notFound}</h1>
      <SiteLink to={homeHref}>{messages.backHome}</SiteLink>
    </main>
  );
}

export function DocsSite<TLocale extends string>({ config, pages }: DocsSiteProps<TLocale>) {
  const resolvedConfig = resolveDocsSiteOptions(config, window.location.origin);
  const { baseURL, locales, defaultLocale } = resolvedConfig;

  const [getPreferredLocale] = useState(() =>
    createBrowserLocalePreference(locales, defaultLocale, resolvedConfig.storageKeys.locale),
  );
  const basename = baseURL.replace(/\/$/u, '') || '/';
  const { api, manual } = resolvedConfig;
  const homePage = pages.find(page => page.slug === null);

  if (homePage === undefined) {
    throw new Error('DocsSite requires one home page with a null slug');
  }

  return (
    <ThemeProvider
      themeStorageKey={resolvedConfig.storageKeys.theme}
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
                  locale={locale}
                  config={resolvedConfig}
                  pages={pages}
                />
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
                          dataBaseURL={resolvedConfig.dataBaseURL}
                          locales={locales}
                          locale={locale}
                          messages={resolvedConfig.messages(locale)}
                          localeLabels={resolvedConfig.localeLabels}
                          api={api}
                        />
                      }
                    />
                  ),
                )}
              {manual !== false && (['manual', 'manual/:slug'] as const).map(path => (
                <Route
                  key={path}
                  path={path}
                  element={
                    <ManualRoute
                      dataBaseURL={resolvedConfig.dataBaseURL}
                      manualDataURL={manual.dataURL}
                      locales={locales}
                      locale={locale}
                      messages={resolvedConfig.messages(locale)}
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
                    homeHref={resolvedConfig.homeHref}
                    messages={resolvedConfig.messages(locale)}
                  />
                }
              />
            </Route>
          ))}
          <Route
            path="*"
            element={
              <NotFound
                homeHref={resolvedConfig.homeHref}
                messages={resolvedConfig.messages(defaultLocale)}
              />
            }
          />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
