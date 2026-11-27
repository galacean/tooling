import { Outlet, matchPath, useLocation } from 'react-router-dom';
import type { DocsSitePage, ResolvedDocsSiteOptions } from '../../config/types';
import { createAPISymbolRouteLookup, loadJSON, parseAPIManifest } from '../../data';
import { isSupportedLocale, withBase } from '../../i18n';
import { parseSearch, resolveSearchItems } from '../../search';
import { siteTargetHref } from '../../routing/paths';
import type { DocsTarget } from '../../routing/targets';
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
  const { baseURL, locales, routes } = config;
  const location = useLocation();
  const messages = config.messages(locale);
  const pathSegments = location.pathname.split('/').filter(Boolean);

  const sitePage = pages.find(page =>
    matchPath(routes.path(locale, page.slug === null ? [] : [page.slug]), location.pathname),
  );
  const inSection = (root: string) =>
    location.pathname === root.slice(0, -1) || location.pathname.startsWith(root);
  const pageKind =
    inSection(routes.api(locale)) && config.api !== undefined
      ? 'api'
      : inSection(routes.manual(locale)) && config.manual !== false
        ? 'manual'
        : sitePage === undefined
          ? 'not-found'
          : 'other';
  const absoluteURL = (pathname: string) =>
    new URL(withBase(`${pathname.replace(/\/+$/u, '')}/`, baseURL), config.siteOrigin).href;
  const getLocaleHref = (language: string, search: string, hash: string) => {
    if (!isSupportedLocale(language, locales)) {
      throw new Error(`Unknown site locale: ${language}`);
    }

    return routes.switchLocale(location.pathname, language, search, hash, locale);
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

    const records = parseSearch(await loadJSON(url), locales);
    const packages = records.some(item => item.target.kind === 'symbol')
      ? parseAPIManifest(await loadJSON(config.dataBaseURL + 'data/api/manifest.json')).packages
      : [];
    const symbolRouteSegment = createAPISymbolRouteLookup();
    const href = (target: DocsTarget) => siteTargetHref(routes, target, packages, symbolRouteSegment);

    return resolveSearchItems(records, { manual: href, api: href });
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
      to: page === 'home' ? '/' : routes.path(locale, [page]),
      end: page === 'home',
    })),
    ...pages.flatMap(page =>
      page.slug === null
        ? []
        : [
            {
              key: `site-page:${page.slug}`,
              label: page.title[locale],
              to: routes.path(locale, [page.slug]),
              ...(page.icon === undefined ? {} : { icon: page.icon }),
            },
          ],
    ),
  ];

  return (
    <SiteShell
      locale={locale}
      {...(config.i18n === undefined ? {} : { i18n: config.i18n })}
      languages={{ options: languageOptions, href: getLocaleHref }}
      messages={messages}
      brand={{
        label: config.brandLabel,
        mark: config.brandMarkURLs,
        docsMark: config.docsBrandMarkURLs,
      }}
      storageKeys={config.storageKeys}
      menu={navigation}
      {...(config.githubHref === undefined ? {} : { githubHref: config.githubHref })}
      pageKind={pageKind}
      pageTitle={
        pageKind === 'api'
          ? (pathSegments.at(-1) ?? 'API')
          : sitePage === undefined || sitePage.slug === null
            ? ''
            : sitePage.title[locale]
      }
      metadata={{
        canonical: absoluteURL(location.pathname),
        alternate: language => absoluteURL(getLocaleHref(language, '', '')),
        limitContentAlternates:
          (pageKind === 'manual' &&
            location.pathname.replace(/\/$/u, '') !== routes.manual(locale).slice(0, -1)) ||
          (pageKind === 'api' &&
            location.pathname.slice(routes.api(locale).length).split('/').filter(Boolean).length >=
              3),
        ...(sitePage?.seo?.description?.[locale] === undefined
          ? {}
          : { description: sitePage.seo.description[locale] }),
      }}
      {...(config.manual !== false || config.api ? { search: loadSearchItems } : {})}
    >
      <Outlet />
    </SiteShell>
  );
}
