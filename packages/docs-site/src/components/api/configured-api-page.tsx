import { formatSymbolCount } from '../../i18n/format';
import {
  createTypeDocAPIDocumentationClient,
  loadAPIReadmeData,
  loadJSON,
  resolveAPIReadmeImage,
  resolveAPIReadmeLink,
} from '../../data';
import type { APIReadmeLinkOptions, TypeDocAPIDocumentationData } from '../../data';
import type { DocsSiteAPIOptions, DocsSiteMessages } from '../../config/types';
import { APIReferenceRoute } from './api-reference-route';

type TypeDocClient = ReturnType<
  typeof createTypeDocAPIDocumentationClient<string>
>;
const apiClients = new Map<string, TypeDocClient>();

function renderSourceURL (
  template: string,
  revision: string,
  filePath: string,
): string {
  return template
    .replace(/#L\{line\}$/u, '')
    .replaceAll('{commit}', revision)
    .replaceAll('{path}', filePath);
}

function getTypeDocClient (
  baseURL: string,
  locales: readonly string[],
): TypeDocClient {
  const key = JSON.stringify([baseURL, locales]);
  let client = apiClients.get(key);

  if (client === undefined) {
    client = createTypeDocAPIDocumentationClient({ baseURL, locales });
    apiClients.set(key, client);
  }

  return client;
}

export function ConfiguredAPIPage ({
  dataBaseURL,
  locales,
  locale,
  messages,
  localeLabels,
  api,
}: {
  dataBaseURL: string;
  locales: readonly string[];
  locale: string;
  messages: DocsSiteMessages;
  localeLabels: Readonly<Record<string, string>>;
  api: DocsSiteAPIOptions;
}) {
  const client = getTypeDocClient(dataBaseURL, locales);
  const isLocale = (value: unknown): value is string =>
    locales.some(locale => locale === value);
  const getRepositoryFileURL = (revision: string, filePath = '') =>
    renderSourceURL(api.sourceLinkTemplate, revision, filePath);
  const readmeLinkOptions: APIReadmeLinkOptions<string> = {
    locales,
    packageReadmes: api.packageReadmes,
    getPackageHref: (pageLocale, packageKey) =>
      `/${pageLocale}/api/${packageKey}/`,
    getRepositoryURL: (pathname, search, hash) =>
      renderSourceURL(
        api.sourceLinkTemplate,
        'main',
        `${pathname}${search}${hash}`,
      ),
  };
  const symbolCountLabel = (count: number, pageLocale: string) => {
    const template = api.symbolCountLabelTemplates?.[pageLocale];

    if (template === undefined) {
      return formatSymbolCount(count, pageLocale, messages);
    }

    return template.replace('{count}', String(count));
  };

  return (
    <APIReferenceRoute<string, object, object, TypeDocAPIDocumentationData>
      locale={locale}
      messages={messages}
      isLocale={isLocale}
      getLocaleLabel={value =>
        isLocale(value) ? (localeLabels[value] ?? value) : value
      }
      loadManifest={client.loadManifest}
      loadAPI={client.loadAPI}
      symbolCountLabel={symbolCountLabel}
      loadReadme={(packageKey, readmeLocale) =>
        loadAPIReadmeData(packageKey, readmeLocale, dataBaseURL, loadJSON, isLocale)
      }
      resolveReadmeLink={(packageKey, href) =>
        resolveAPIReadmeLink(packageKey, href, readmeLinkOptions)
      }
      resolveReadmeImage={(packageKey, src) =>
        resolveAPIReadmeImage(packageKey, src, (pathname, search) =>
          api.rawAssetURLTemplate
            .replace('{path}', pathname)
            .replace('{search}', search),
        )
      }
      getRepositoryFileURL={getRepositoryFileURL}
    />
  );
}
