import { useEffect, useState } from 'react';
import type { ManualNavigationPage, ManualPageDocument } from '../../manual/document';
import type { ManualSource } from '../../manual/source';

// Effect cleanup detaches the previous request when the host changes locale, slug or source.
function observeRequest<T>(request: Promise<T>, onLoad: (value: T) => void, onError: () => void) {
  let active = true;

  void request.then(value => {
    if (active) {
      onLoad(value);
    }
  }).catch(() => {
    if (active) {
      onError();
    }
  });

  return () => {
    active = false;
  };
}

export function useManualContent(
  locale: string,
  slug: string | undefined,
  { loadNavigation, loadOverview, loadPage }: ManualSource,
) {
  const [navigation, setNavigation] = useState<{
    locale: string;
    pages: ManualNavigationPage[];
  }>();
  const [navigationError, setNavigationError] = useState<string>();
  const [loaded, setLoaded] = useState<{
    locale: string;
    slug: string;
    page: ManualPageDocument;
  }>();
  const [loadError, setLoadError] = useState<{
    locale: string;
    slug: string;
  }>();
  const [overview, setOverview] = useState<{
    locale: string;
    page: ManualPageDocument;
  }>();
  const [overviewError, setOverviewError] = useState<string>();
  const pages = navigation?.locale === locale ? navigation.pages : undefined;
  const selected = pages?.find(page => page.slug === slug);

  useEffect(() => {
    setNavigationError(undefined);

    return observeRequest(
      loadNavigation(locale),
      pages => setNavigation({ locale, pages }),
      () => setNavigationError(locale),
    );
  }, [locale, loadNavigation]);
  useEffect(() => {
    if (slug !== undefined) {
      return;
    }
    setOverviewError(undefined);

    return observeRequest(
      loadOverview(locale),
      page => setOverview({ locale, page }),
      () => setOverviewError(locale),
    );
  }, [locale, slug, loadOverview]);
  useEffect(() => {
    if (slug === undefined || selected === undefined) {
      return;
    }
    setLoadError(undefined);

    return observeRequest(
      loadPage(locale, slug),
      page => setLoaded({ locale, slug, page }),
      () => setLoadError({ locale, slug }),
    );
  }, [locale, slug, selected, loadPage]);

  const chapter = loaded?.locale === locale ? loaded : undefined;
  const pageFailed = loadError?.locale === locale && loadError.slug === slug;
  // Keep the preceding chapter and its links together during same-language navigation.
  const isPageTransition =
    selected !== undefined && !pageFailed && chapter !== undefined && chapter.slug !== slug;
  const displayed = chapter?.slug === slug || isPageTransition ? chapter : undefined;

  return {
    pages,
    selected,
    navigationFailed: navigationError === locale,
    overviewContent: overview?.locale === locale ? overview.page : undefined,
    overviewFailed: overviewError === locale,
    displayedContent: displayed?.page,
    displayedSlug: displayed?.slug ?? slug,
    pageFailed,
    isPageTransition,
  };
}
