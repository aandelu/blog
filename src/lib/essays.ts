import { getCollection, getEntry, type CollectionEntry } from 'astro:content';

export type Essay = CollectionEntry<'essays'>;
export type Author = CollectionEntry<'authors'>;

// Published essays, newest first. Drafts show up only in `astro dev`.
export async function publishedEssays(): Promise<Essay[]> {
  const all = await getCollection('essays', (e) => import.meta.env.DEV || !e.data.draft);
  return all.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export async function allAuthors(): Promise<Author[]> {
  const authors = await getCollection('authors');
  return authors.sort((a, b) => a.data.name.localeCompare(b.data.name));
}

export async function authorOf(essay: Essay): Promise<Author> {
  const author = await getEntry(essay.data.author);
  if (!author) throw new Error(`Essay "${essay.id}" names an unknown author "${essay.data.author.id}".`);
  return author;
}

// Map of essay id -> number of essays that reply to it.
export function responseCounts(essays: Essay[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of essays) {
    if (e.data.replyTo) counts.set(e.data.replyTo, (counts.get(e.data.replyTo) ?? 0) + 1);
  }
  return counts;
}
