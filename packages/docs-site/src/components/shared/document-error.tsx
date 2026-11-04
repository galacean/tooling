export function DocumentError({
  title,
  description,
  heading = 'h1',
  layout = 'inline',
}: {
  title: string;
  description: string;
  heading?: 'h1' | 'h2';
  layout?: 'inline' | 'page';
}) {
  const Heading = heading;
  const Container = layout === 'page' ? 'main' : 'div';

  return (
    <Container
      className={
        layout === 'page' ? 'document-error-page' : 'document-error-inline'
      }
      role="alert"
    >
      <div className="document-error-message">
        <Heading>{title}</Heading>
        <p>{description}</p>
      </div>
    </Container>
  );
}
