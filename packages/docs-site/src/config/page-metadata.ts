export function formatPageTitle(title: string, siteName: string): string {
  return title === '' || title === siteName ? siteName : `${title} | ${siteName}`;
}

export function formatPageDescription(locale: string, title: string, description?: string): string {
  const fallback = locale.startsWith('zh')
    ? `${title}的使用说明与参考文档。`
    : `Documentation and reference for ${title}.`;

  const value = description?.trim();

  return [...(value === undefined || value === '' ? fallback : value).replace(/\s+/gu, ' ')]
    .slice(0, 160).join('');
}
