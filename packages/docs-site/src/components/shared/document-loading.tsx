export type DocumentLoadingProps = {
  layout?: 'manual' | 'api';
  label?: string;
};

export function DocumentLoading({ layout, label }: DocumentLoadingProps) {
  const content = (
    <div className="document-loading-content" aria-hidden="true" />
  );
  const status =
    label === undefined ? null : (
      <p className="document-loading-label" role="status">
        {label}
      </p>
    );

  if (layout === undefined) {
    return (
      <div
        className="document-loading document-loading-inline"
        aria-busy="true"
      >
        {status}
        {content}
      </div>
    );
  }

  return (
    <main
      className={`document-loading document-loading-page document-loading-${layout}`}
      aria-busy="true"
    >
      <div className="document-loading-sidebar" aria-hidden="true" />
      <div className="document-loading-body">
        {status}
        {content}
      </div>
    </main>
  );
}
