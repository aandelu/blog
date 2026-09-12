const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ESCAPES[c] ?? c);
}

// Titles and one-line summaries are plain text in front matter, but book
// titles want italics. *Like this* becomes <em>Like this</em>.
export function inlineMarkup(text: string): string {
  return escapeHtml(text).replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

export function countLabel(n: number, singular: string, plural = `${singular}s`): string {
  const word = n < WORDS.length ? WORDS[n] : String(n);
  return `${word} ${n === 1 ? singular : plural}`;
}
