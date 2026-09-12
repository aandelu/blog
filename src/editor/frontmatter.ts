// Reads and writes the essay file format: YAML-ish front matter followed by
// the essay body as HTML (one block element per line, no blank lines, so
// Astro's Markdown pipeline passes it through untouched).

export interface EssayMeta {
  title: string;
  dek?: string;
  author: string;
  date: string;
  bookTitle?: string;
  bookAuthor?: string;
  replyTo?: string;
  draft?: boolean;
}

const ORDER: Array<keyof EssayMeta> = ['title', 'dek', 'author', 'date', 'bookTitle', 'bookAuthor', 'replyTo', 'draft'];

export function serializeEssay(meta: EssayMeta, html: string): string {
  const lines = ['---'];
  for (const key of ORDER) {
    const value = meta[key];
    if (value === undefined || value === '' || value === false) continue;
    lines.push(`${key}: ${typeof value === 'boolean' ? String(value) : JSON.stringify(value)}`);
  }
  lines.push('---');
  return `${lines.join('\n')}\n${prettyHtml(html)}\n`;
}

// One block per line keeps diffs readable. Blank lines would end the HTML
// block in Markdown, so collapse any run of newlines to a single one.
export function prettyHtml(html: string): string {
  return html
    .replace(/<\/(p|h[1-6]|blockquote|ul|ol|li|pre|figure)>/g, '</$1>\n')
    .replace(/<hr\s*\/?>/g, '<hr>\n')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

export function parseFrontmatter(text: string): { meta: Record<string, string | boolean>; body: string } {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: text.trim() };
  const meta: Record<string, string | boolean> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w]*):\s*(.*)$/);
    if (!kv) continue;
    const raw = kv[2]!.trim();
    let value: string | boolean = raw;
    if (raw.startsWith('"')) {
      try { value = JSON.parse(raw); } catch { value = raw.slice(1, -1); }
    } else if (raw.startsWith("'") && raw.endsWith("'")) {
      value = raw.slice(1, -1);
    } else if (raw === 'true' || raw === 'false') {
      value = raw === 'true';
    }
    meta[kv[1]!] = value;
  }
  return { meta, body: match[2]!.trim() };
}

export function looksLikeHtml(body: string): boolean {
  return /^\s*<(p|h[1-6]|blockquote|ul|ol|hr|div|figure)\b/i.test(body);
}

// Fallback for essays written by hand in Markdown: keep the text, lose the
// formatting. The editor warns when it has to do this.
export function plainTextToHtml(body: string): string {
  const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  return body
    .split(/\n\s*\n/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p>${escape(para).replace(/\n/g, ' ')}</p>`)
    .join('\n');
}
