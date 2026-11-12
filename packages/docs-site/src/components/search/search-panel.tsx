import { useEffect, useRef, useState } from 'react';
import { Icon } from '../shared';
import { searchResults } from '../../search';
import type { SearchResult } from '../../search';

export interface SearchPanelMessages {
  search: string;
  close: string;
  searchPlaceholder: string;
  manualSearchPlaceholder: string;
  storageError: string;
  loading: string;
  loadError: string;
  retry: string;
  history: string;
  clear: string;
  searchHistoryEmpty: string;
  noResults: string;
  delete: string;
  original: string;
  api: string;
  manual: string;
}

export interface SearchPanelProps {
  locale: string;
  brandLabel: string;
  brandMarkUrl: string;
  historyKeyPrefix: string;
  messages: SearchPanelMessages;
  includeAPI?: boolean;
  loadItems: (locale: string) => Promise<SearchResult[]>;
  navigate: (url: string) => void;
  close: () => void;
}

function Highlight({ text, query }: { text: string; query: string }) {
  const offset = text.toLowerCase().indexOf(query.toLowerCase());

  return offset < 0 || query === '' ? (
    <>{text}</>
  ) : (
    <>
      {text.slice(0, offset)}
      <mark>{text.slice(offset, offset + query.length)}</mark>
      {text.slice(offset + query.length)}
    </>
  );
}

export function SearchPanel({
  locale,
  brandLabel,
  brandMarkUrl,
  historyKeyPrefix,
  messages: t,
  includeAPI = true,
  loadItems,
  navigate,
  close,
}: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<SearchResult[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const key = `${historyKeyPrefix}:${locale}`;

  useEffect(() => {
    setQuery('');
    setDebounced('');
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');

      if (
        !Array.isArray(stored) ||
        !stored.every((item: unknown) => typeof item === 'string')
      ) {
        throw new Error('Invalid search history');
      }
      setHistory(
        stored.filter((item: string) => item.length >= 2).slice(0, 12),
      );
      setStorageError(false);
    } catch {
      setHistory([]);
      setStorageError(true);
    }
  }, [key]);
  useEffect(() => {
    let cancelled = false;

    setError('');
    setLoading(true);
    void (async () => {
      const results = await loadItems(locale);

      if (!cancelled) {
        setItems(
          includeAPI
            ? results
            : results.filter(item => item.category === 'manual'),
        );
      }
    })()
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [locale, attempt, loadItems, includeAPI]);
  useEffect(() => {
    const element = dialog.current;

    if (element === null) {
      return;
    }
    element.showModal();
    input.current?.focus();

    return () => element.close();
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(query.trim());
      list.current?.scrollTo?.({ top: 0 });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [query]);
  const saveHistory = (values: string[]) => {
    setHistory(values);
    try {
      localStorage.setItem(key, JSON.stringify(values));
    } catch {
      setStorageError(true);
    }
  };
  const results = searchResults(items, debounced);
  const categories = includeAPI
    ? (['manual', 'api'] as const)
    : (['manual'] as const);

  return (
    <dialog
      ref={dialog}
      className="site-search"
      aria-labelledby="site-search-title"
      onCancel={event => {
        event.preventDefault();
        close();
      }}
      onClick={event => {
        if (event.target === event.currentTarget) {
          close();
        }
      }}
    >
      <header className="site-search-header">
        <div className="site-search-heading">
          <img src={brandMarkUrl} alt="" aria-hidden="true" />
          <div>
            <span className="site-search-eyebrow">
              {brandLabel.toUpperCase()} / {locale.toUpperCase()}
            </span>
            <h2 id="site-search-title">{t.search}</h2>
          </div>
        </div>
        <button
          type="button"
          className="icon-action"
          aria-label={t.close}
          title={t.close}
          onClick={close}
        >
          <Icon name="close" />
        </button>
      </header>
      <label className="site-search-input">
        <Icon name="search" />
        <input
          ref={input}
          type="search"
          value={query}
          placeholder={
            includeAPI ? t.searchPlaceholder : t.manualSearchPlaceholder
          }
          aria-label={
            includeAPI ? t.searchPlaceholder : t.manualSearchPlaceholder
          }
          onChange={event => setQuery(event.target.value)}
        />
      </label>
      {storageError && (
        <p className="site-search-warning" role="status">
          {t.storageError}
        </p>
      )}
      <div
        className="search-results docs-scroll-area"
        ref={list}
        aria-busy={loading}
      >
        {loading ? (
          <div className="search-state" role="status">
            <Icon name="search" />
            <p>{t.loading}</p>
          </div>
        ) : error !== '' ? (
          <div className="search-state search-state-error" role="alert">
            <Icon name="source" />
            <strong>{t.loadError}</strong>
            <p>{error}</p>
            <button
              type="button"
              onClick={() => setAttempt(value => value + 1)}
            >
              {t.retry}
              <Icon name="arrow" />
            </button>
          </div>
        ) : debounced.length < 2 ? (
          <>
            <header className="search-history-header">
              <span>{t.history}</span>
              {history.length > 0 && (
                <button type="button" onClick={() => saveHistory([])}>
                  {t.clear}
                </button>
              )}
            </header>
            {history.length === 0 ? (
              <div className="search-state">
                <Icon name="search" />
                <p>{t.searchHistoryEmpty}</p>
              </div>
            ) : (
              history.map(term => (
                <div key={term} className="search-history-row">
                  <button type="button" onClick={() => setQuery(term)}>
                    <Icon name="search" />
                    <span>{term}</span>
                    <Icon name="arrow" />
                  </button>
                  <button
                    type="button"
                    className="icon-action"
                    aria-label={`${t.delete} ${term}`}
                    title={`${t.delete} ${term}`}
                    onClick={() =>
                      saveHistory(history.filter(value => value !== term))
                    }
                  >
                    <Icon name="close" />
                  </button>
                </div>
              ))
            )}
          </>
        ) : results.length === 0 ? (
          <div className="search-state" role="status">
            <Icon name="search" />
            <p>{t.noResults}</p>
          </div>
        ) : (
          categories.map(category => {
            const matches = results.filter(item => item.category === category);

            return matches.length === 0 ? null : (
              <section key={category} className="search-result-group">
                <h3>
                  <span>{category === 'api' ? t.api : t.manual}</span>
                  <span>{matches.length}</span>
                </h3>
                {matches.map(item => (
                  <button
                    type="button"
                    key={item.url}
                    className="search-result"
                    onClick={() => {
                      saveHistory(
                        [
                          debounced,
                          ...history.filter(term => term !== debounced),
                        ].slice(0, 12),
                      );
                      close();
                      navigate(item.url);
                    }}
                  >
                    <span
                      className={`search-result-icon search-result-icon-${category}`}
                    >
                      <Icon name={category === 'api' ? 'source' : 'book'} />
                    </span>
                    <span className="search-result-content">
                      <strong>
                        <Highlight text={item.name} query={debounced} />
                      </strong>
                      {(item.pkg !== undefined ||
                        item.version !== undefined) && (
                        <small className="search-result-meta">
                          {[item.pkg, item.version]
                            .filter(value => value !== undefined)
                            .join(' / ')}
                        </small>
                      )}
                      <span className="search-result-summary">
                        <Highlight text={item.summary} query={debounced} />
                      </span>
                      {item.sourceLocale !== locale && (
                        <small className="search-result-meta">
                          {t.original}: {item.sourceLocale}
                        </small>
                      )}
                    </span>
                    <Icon name="arrow" className="search-result-arrow" />
                  </button>
                ))}
              </section>
            );
          })
        )}
      </div>
      <footer className="site-search-footer">
        {includeAPI && (
          <span>
            <Icon name="source" />
            {t.api}
          </span>
        )}
        <span>
          <Icon name="book" />
          {t.manual}
        </span>
      </footer>
    </dialog>
  );
}
