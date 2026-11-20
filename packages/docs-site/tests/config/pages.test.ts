import { describe, expect, it } from 'vitest';
import { bindDocsSitePages } from '../../src/config/pages';

describe('site page declarations and renderers', () => {
  it('binds localized declarations without converting titles to callbacks', () => {
    const render = () => null;
    const pages = bindDocsSitePages([
      { slug: null },
      { slug: 'about', title: { en: 'About', 'zh-CN': '关于' }, icon: 'source' },
    ], { home: render, about: render });

    expect(pages[1]).toEqual({
      slug: 'about', title: { en: 'About', 'zh-CN': '关于' }, icon: 'source', render,
    });
  });

  it('requires a renderer for every declared page', () => {
    expect(() => bindDocsSitePages([{ slug: null }], {})).toThrow(/renderer.*home/u);
    expect(() => bindDocsSitePages([
      { slug: null }, { slug: 'about', title: { en: 'About', 'zh-CN': '关于' } },
    ], { home: () => null })).toThrow(/renderer.*about/u);
  });

  it('binds the locale root and a page named home independently', () => {
    const declarations = [{ slug: null }, { slug: 'home', title: { en: 'Home' } }];
    const root = () => 'Root';
    const home = () => 'Home';

    expect(bindDocsSitePages(declarations, { '/': root, home }).map(page => page.render('en')))
      .toEqual(['Root', 'Home']);
    expect(() => bindDocsSitePages(declarations, { home })).toThrow('Missing page renderer for /');
  });

  it('does not use inherited object methods as page renderers', () => {
    expect(() => bindDocsSitePages([
      { slug: null }, { slug: 'constructor', title: { en: 'Example', 'zh-CN': '示例' } },
    ], { home: () => null })).toThrow(/renderer.*constructor/u);
  });
});
