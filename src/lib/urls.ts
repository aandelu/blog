// All internal links go through here so the site works under a base path
// (aandelu.github.io/blog) and, later, at the root of a custom domain.
const base = import.meta.env.BASE_URL.replace(/\/+$/, '');

export function url(path: string): string {
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function essayUrl(id: string): string {
  return url(`/essays/${id}/`);
}

export function authorUrl(id: string): string {
  return url(`/authors/${id}/`);
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
