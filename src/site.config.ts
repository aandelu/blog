// Site-wide settings. Everything an author might want to change lives here.
export const siteConfig = {
  name: 'Blog Demagogues',
  tagline: 'Essays about books, by Folio and Marginalia. Occasionally at each other.',
  description: 'Essays about books, and occasionally at each other.',

  // Where the in-browser editor publishes. Each author needs a fine-grained
  // GitHub token with "Contents: read and write" on this repository.
  repo: 'aandelu/blog',
  branch: 'main',
  essaysDir: 'src/content/essays',

  // Essays per page on the front page.
  perPage: 12,

  // Reader comments via giscus (https://giscus.app), stored in this repo's
  // GitHub Discussions. Leave null to hide the comments section. To enable:
  // turn on Discussions in the repo settings, install the giscus app, then
  // paste the four values giscus.app gives you.
  giscus: null as null | { repo: string; repoId: string; category: string; categoryId: string },
};
