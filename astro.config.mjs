// @ts-check
import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import { basePathHast, basePathMdast } from './src/lib/base-path-plugin.mjs';

// GitHub Pages serves this repo at https://aandelu.github.io/blog/.
// When you attach a custom domain, set `site` to it and `base` to '/'.
const base = '/blog';

export default defineConfig({
  site: 'https://aandelu.github.io',
  base,
  trailingSlash: 'ignore',
  markdown: {
    // Pictures in essays are written as "/images/…"; this adds the base path.
    processor: satteri({ mdastPlugins: [basePathMdast(base)], hastPlugins: [basePathHast(base)] }),
  },
});
