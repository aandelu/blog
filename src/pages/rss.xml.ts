import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { siteConfig } from '../site.config';
import { publishedEssays } from '../lib/essays';
import { essayUrl, url } from '../lib/urls';

export const GET: APIRoute = async (context) => {
  const essays = await publishedEssays();
  return rss({
    title: siteConfig.name,
    description: siteConfig.description,
    // The channel link points at the site's base path, not the bare origin.
    site: new URL(url('/'), context.site ?? 'https://aandelu.github.io'),
    items: essays.map((e) => ({
      title: e.data.title,
      pubDate: e.data.date,
      description: e.data.dek,
      link: essayUrl(e.id),
    })),
  });
};
