import { useInsertionEffect, useState } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { createBrowserLocalePreference } from '../../i18n';
import { DocsI18nProvider } from '../../providers/i18n';
import { resolveDocsSiteOptions } from '../../config/resolve';
import { DocsRouterAdapter } from '../../routing/react-router-adapter';
import type { DocsRoutes } from '../../routing/paths';
import { lazyComponent } from '../shared/lazy-component';
import { ConfiguredSiteShell } from './configured-site-shell';
import { DocsLink } from '../../routing/navigation';
import type { CommonSiteMessages } from '../../i18n';
import type { DocsSiteProps } from './docs-site';

const Manual = lazyComponent(() => import('./site-manual.js').then(module => module.SiteManual));
const SiteAPIPage = lazyComponent(() => import('./site-api.js').then(module => module.SiteAPI));

function LocaleRedirect({
  getPreferredLocale,
  routes,
}: {
  getPreferredLocale: () => string;
  routes: DocsRoutes;
}) {
  const [locale] = useState(getPreferredLocale);
  const { search, hash } = useLocation();

  return <Navigate replace to={{ pathname: routes.path(locale), search, hash }} />;
}

function NotFound({ messages }: { messages: CommonSiteMessages }) {
  return (
    <main className="docs-state-page">
      <h1>404 · {messages.notFound}</h1>
      <DocsLink to="/">{messages.backHome}</DocsLink>
    </main>
  );
}

export function DocsSite<TLocale extends string>({ config, pages }: DocsSiteProps<TLocale>) {
  useInsertionEffect(() => {
    const margin = document.body.style.getPropertyValue('margin');
    const priority = document.body.style.getPropertyPriority('margin');

    document.body.style.setProperty('margin', '0');

    return () => {
      if (margin === '') {
        document.body.style.removeProperty('margin');
      } else {
        document.body.style.setProperty('margin', margin, priority);
      }
    };
  }, []);
  const resolvedConfig = resolveDocsSiteOptions(config, window.location.origin);
  const { baseURL, locales, defaultLocale, routes } = resolvedConfig;

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
    <DocsI18nProvider
      {...(resolvedConfig.i18n === undefined ? {} : { options: resolvedConfig.i18n })}
    >
      <BrowserRouter basename={basename}>
        <DocsRouterAdapter>
          <Routes>
            <Route
              path="/"
              element={<LocaleRedirect routes={routes} getPreferredLocale={getPreferredLocale} />}
            />
            {locales.map(locale => (
              <Route
                key={locale}
                element={
                  <ConfiguredSiteShell locale={locale} config={resolvedConfig} pages={pages} />
                }
              >
                <Route path={routes.path(locale)} element={homePage.render(locale)} />
                {api !== undefined &&
                  (
                    [
                      routes.api(locale),
                      `${routes.api(locale)}:pkg`,
                      `${routes.api(locale)}:pkg/:version/:symbol`,
                    ] as const
                  ).map(path => (
                    <Route
                      key={path}
                      path={path}
                      element={
                        <SiteAPIPage
                          routes={routes}
                          dataBaseURL={resolvedConfig.dataBaseURL}
                          locales={locales}
                          locale={locale}
                          messages={resolvedConfig.messages(locale)}
                          localeLabels={resolvedConfig.localeLabels}
                          api={api}
                        />
                      }
                    />
                  ))}
                {manual !== false &&
                  ([routes.manual(locale), `${routes.manual(locale)}:slug`] as const).map(
                    path => (
                      <Route
                        key={path}
                        path={path}
                        element={
                          <Manual
                            routes={routes}
                            dataBaseURL={resolvedConfig.dataBaseURL}
                            manualDataURL={manual.dataURL}
                            locales={locales}
                          />
                        }
                      />
                    ),
                  )}
                {pages.map(page =>
                  page.slug === null ? null : (
                    <Route
                      key={page.slug}
                      path={routes.path(locale, [page.slug])}
                      element={page.render(locale)}
                    />
                  ),
                )}
                <Route
                  path={`${routes.path(locale)}*`}
                  element={
                    <NotFound
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
                  messages={resolvedConfig.messages(defaultLocale)}
                />
              }
            />
          </Routes>
        </DocsRouterAdapter>
      </BrowserRouter>
    </DocsI18nProvider>
  );
}
