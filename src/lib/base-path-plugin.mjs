// Essays refer to their pictures by site-relative paths ("/images/…"), so the
// essay files need no change when the site moves from aandelu.github.io/blog/
// to a domain of its own. These plugins add the base path while building:
// the first one to raw HTML blocks (which is how the editor writes essays),
// the second to links and images written in Markdown syntax.
const TAGS = { img: ['src'], source: ['src'], video: ['src', 'poster'], audio: ['src'], a: ['href'] };

function fixer(base) {
  const prefix = base.replace(/\/$/, '');
  return (value) =>
    prefix && typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && value !== prefix && !value.startsWith(`${prefix}/`)
      ? prefix + value
      : value;
}

export function basePathMdast(base) {
  const fix = fixer(base);
  const attr = /(<(?:img|source|video|audio|a)\b[^>]*?\s(?:src|href|poster)=")([^"]*)"/gi;
  return {
    name: 'base-path-html',
    html(node, ctx) {
      const value = node.value.replace(attr, (_m, pre, url) => `${pre}${fix(url)}"`);
      if (value !== node.value) ctx.setProperty(node, 'value', value);
    },
  };
}

export function basePathHast(base) {
  const fix = fixer(base);
  return {
    name: 'base-path',
    element: {
      filter: Object.keys(TAGS),
      visit(node, ctx) {
        const props = node.properties ?? {};
        for (const attr of TAGS[node.tagName] ?? []) {
          const fixed = fix(props[attr]);
          if (fixed !== props[attr]) ctx.setProperty(node, attr, fixed);
        }
      },
    },
  };
}
