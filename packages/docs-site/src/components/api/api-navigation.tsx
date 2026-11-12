import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { APIManifestPackage, APISymbol } from '../../data';
import { SelectControl } from '../shared';

export interface APIVersionTarget {
  version: string;
  entryKey: string;
  symbolName: string;
}

export function resolveAPIVersionTarget(
  pkg: APIManifestPackage,
  version: string,
  entryKey: string,
  symbolName: string | undefined,
): APIVersionTarget | undefined {
  const selected =
    version === 'current'
      ? pkg.current
      : pkg.versions.find(item => item.version === version);
  const entry =
    selected?.entries.find(item => item.key === entryKey) ??
    selected?.entries[0];
  const symbol =
    entry?.symbols.find(item => item.name === symbolName) ?? entry?.symbols[0];

  return entry === undefined || symbol === undefined
    ? undefined
    : { version, entryKey: entry.key, symbolName: symbol.name };
}

export interface APISymbolMenuProps {
  symbols: APISymbol[];
  selectedName: string | undefined;
  ariaLabel: string;
  getGroupLabel: (kind: number) => string;
  getSymbolHref: (name: string) => string;
  renderKind: (kind: number) => ReactNode;
  onSelect: () => void;
}

export function APISymbolMenu({
  symbols,
  selectedName,
  ariaLabel,
  getGroupLabel,
  getSymbolHref,
  renderKind,
  onSelect,
}: APISymbolMenuProps) {
  const grouped = new Map<string, APISymbol[]>();

  for (const symbol of symbols) {
    const group = getGroupLabel(symbol.kind);

    grouped.set(group, [...(grouped.get(group) ?? []), symbol]);
  }

  return (
    <nav className="api-menu docs-scroll-area" aria-label={ariaLabel}>
      {[...grouped].map(([name, items]) => (
        <section className="api-menu-group" key={name}>
          <h2>{name}</h2>
          <ul>
            {items.map(item => (
              <li key={item.name}>
                <Link
                  to={getSymbolHref(item.name)}
                  onClick={onSelect}
                  className={
                    item.name === selectedName
                      ? 'api-menu-item selected'
                      : 'api-menu-item'
                  }
                  aria-current={item.name === selectedName ? 'page' : undefined}
                >
                  {renderKind(item.kind)}
                  <span>{item.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}

export interface APINavigationToolbarProps {
  pkg: APIManifestPackage;
  packages: APIManifestPackage[];
  version: string;
  entryKey: string;
  symbol: Pick<APISymbol, 'name' | 'kind'> | undefined;
  packageHome: boolean;
  showInherited: boolean;
  onShowInheritedChange: (value: boolean) => void;
  messages: {
    api: string;
    version: string;
    apiPackage: string;
    showInherited: string;
  };
  getPackageHref: (key: string) => string;
  getSymbolHref: (target: APIVersionTarget) => string;
  renderKind: (kind: number) => ReactNode;
}

export function APINavigationToolbar({
  pkg,
  packages,
  version,
  entryKey,
  symbol,
  packageHome,
  showInherited,
  onShowInheritedChange,
  messages: t,
  getPackageHref,
  getSymbolHref,
  renderKind,
}: APINavigationToolbarProps) {
  const navigate = useNavigate();

  return (
    <>
      <div className="api-breadcrumb">
        <SelectControl
          className="api-package-select"
          ariaLabel={t.apiPackage}
          value={pkg.key}
          options={packages.map(item => ({
            value: item.key,
            label: item.name,
          }))}
          onChange={value => {
            if (packages.some(item => item.key === value)) {
              void navigate(getPackageHref(value));
            }
          }}
        />
        {!packageHome && (
          <>
            <span className="api-breadcrumb-separator" aria-hidden="true">
              /
            </span>
            <SelectControl
              className="api-version-select"
              ariaLabel={t.version}
              value={version}
              options={[pkg.current, ...pkg.versions].map(item => ({
                value: item.version,
                label:
                  item.version === 'current'
                    ? `current (${pkg.current.packageVersion})`
                    : item.version,
              }))}
              onChange={value => {
                const target = resolveAPIVersionTarget(
                  pkg,
                  value,
                  entryKey,
                  symbol?.name,
                );

                if (target !== undefined) {
                  void navigate(getSymbolHref(target));
                }
              }}
            />
          </>
        )}
        {!packageHome && symbol !== undefined && (
          <span className="api-current-symbol">
            <span className="api-breadcrumb-separator" aria-hidden="true">
              /
            </span>{' '}
            {renderKind(symbol.kind)} {symbol.name}
          </span>
        )}
      </div>
      {!packageHome && (
        <label className="api-inherited-toggle" title={t.showInherited}>
          <input
            type="checkbox"
            aria-label={t.showInherited}
            checked={showInherited}
            onChange={event => onShowInheritedChange(event.target.checked)}
          />
          <span />
        </label>
      )}
    </>
  );
}
