import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { createManualSource } from '../../manual/source';
import { Manual } from '../manual/manual';
import { siteTargetHref } from '../../routing/paths';
import type { DocsRoutes } from '../../routing/paths';

export function SiteManual({
  dataBaseURL,
  manualDataURL,
  locales,
  routes,
}: {
  dataBaseURL: string;
  manualDataURL?: string;
  locales: readonly string[];
  routes: DocsRoutes;
}) {
  const { slug } = useParams();
  const source = useMemo(
    () =>
      createManualSource({
        baseURL: dataBaseURL,
        locales,
        ...(manualDataURL === undefined ? {} : { manualDataURL }),
      }),
    [dataBaseURL, manualDataURL, locales],
  );

  return <Manual source={source} slug={slug} href={target => siteTargetHref(routes, target)} />;
}
