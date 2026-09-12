// A small index of published essays, used by the editor's "Reply to" picker.
import type { APIRoute } from 'astro';
import { publishedEssays } from '../lib/essays';

export const GET: APIRoute = async () => {
  const essays = await publishedEssays();
  const index = essays.map((e) => ({
    id: e.id,
    title: e.data.title,
    author: e.data.author.id,
    date: e.data.date.toISOString().slice(0, 10),
  }));
  return new Response(JSON.stringify(index), { headers: { 'Content-Type': 'application/json' } });
};
