import type { ReactNode } from 'react';
import { DocsLink as Link } from '../../routing/navigation';
import type { APIManifestPackage, APISymbol } from '../../data';
import { SelectControl } from '../shared';

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

    const members = grouped.get(group);

    if (members === undefined) {
      grouped.set(group, [symbol]);
    } else {
      members.push(symbol);
    }
  }

  return (
    <nav className="api-menu" aria-label={ariaLabel}>
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
  onPackageChange?: ((packageKey: string) => void) | undefined;
  onVersionChange?: ((version: string) => void) | undefined;
  renderKind: (kind: number) => ReactNode;
}

export function APINavigationToolbar({
  pkg,
  packages,
  version,
  symbol,
  packageHome,
  showInherited,
  onShowInheritedChange,
  messages: t,
  onPackageChange,
  onVersionChange,
  renderKind,
}: APINavigationToolbarProps) {
  const versionLabel = (value: string) =>
    value === 'current' ? `current (${pkg.current.packageVersion})` : value;

  return (
    <>
      <div className="api-breadcrumb">
        {onPackageChange === undefined ? (
          <span>{pkg.name}</span>
        ) : (
          <SelectControl
            className="api-package-select"
            ariaLabel={t.apiPackage}
            value={pkg.key}
            options={packages.map(item => ({ value: item.key, label: item.name }))}
            onChange={onPackageChange}
          />
        )}
        {!packageHome && (
          <>
            <span className="api-breadcrumb-separator" aria-hidden="true">
              /
            </span>
            {onVersionChange === undefined ? (
              <span>{versionLabel(version)}</span>
            ) : (
              <SelectControl
                className="api-version-select"
                ariaLabel={t.version}
                value={version}
                options={[pkg.current, ...pkg.versions].map(item => ({
                  value: item.version,
                  label: versionLabel(item.version),
                }))}
                onChange={onVersionChange}
              />
            )}
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
