// @ts-check
import { defineConfig } from 'astro/config';

// GitHub Pages serves this repo at https://aandelu.github.io/blog/.
// When you attach a custom domain, set `site` to it and `base` to '/'.
export default defineConfig({
  site: 'https://aandelu.github.io',
  base: '/blog',
  trailingSlash: 'ignore',
});
