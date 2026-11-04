import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface APIReflectionOutlineItem {
  key: string;
  label: string;
  href: string;
}

export interface APIReflectionLayoutProps {
  contentsLabel: string;
  overviewLabel: string;
  overviewHref: string;
  outline: APIReflectionOutlineItem[];
  children: ReactNode;
}

export interface APIReflectionMember {
  id: string;
  name: string;
  href: string;
  kindLabel: ReactNode;
  optional?: boolean;
  headerContent?: ReactNode;
  children: ReactNode;
}

export interface APIReflectionGroup {
  id: string;
  label: string;
  members: APIReflectionMember[];
}

export interface APIReflectionSectionsProps {
  overviewLabel: string;
  reflectionLabel: ReactNode;
  groups: APIReflectionGroup[];
}

export function APIReflectionLayout({
  contentsLabel,
  overviewLabel,
  overviewHref,
  outline,
  children,
}: APIReflectionLayoutProps) {
  return (
    <div className="api-detail">
      <aside className="api-outline" aria-label={contentsLabel}>
        <strong>{contentsLabel}</strong>
        <Link to={overviewHref}>{overviewLabel}</Link>
        {outline.map(item => (
          <Link key={item.key} to={item.href}>
            {item.label}
          </Link>
        ))}
      </aside>
      <div className="api-detail-main">{children}</div>
    </div>
  );
}

export function APIReflectionSections({
  overviewLabel,
  reflectionLabel,
  groups,
}: APIReflectionSectionsProps) {
  const memberCount = groups.reduce(
    (count, group) => count + group.members.length,
    0,
  );

  return (
    <>
      <h3 id="api-overview">{overviewLabel}</h3>
      <div className="api-overview">
        <strong>{reflectionLabel}</strong>
        {groups.map(group => (
          <details key={group.id} open>
            <summary>{group.label}</summary>
            <ul>
              {group.members.map(member => (
                <li key={member.id}>
                  <Link to={member.href}>
                    {member.kindLabel} {member.name}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
      {memberCount > 0 && <hr className="api-divider" />}
      {groups.length > 0 && (
        <div className="api-member-groups">
          {groups.map(group => (
            <section className="api-member-group" id={group.id} key={group.id}>
              <h2>{group.label}</h2>
              <div className="api-member-list">
                {group.members.map(member => (
                  <article
                    key={member.id}
                    id={member.name}
                    className="api-member-card"
                  >
                    <header>
                      <Link to={member.href} className="anchor-link">
                        #
                      </Link>
                      {member.kindLabel}
                      <h3>
                        {member.name}
                        {member.optional === true ? '?' : ''}
                      </h3>
                      {member.headerContent}
                    </header>
                    {member.children}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
