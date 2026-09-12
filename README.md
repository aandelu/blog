# Counterpoint

A blog for two (or more) people who write essays about books, sometimes in reply to each other.

- The site is static, built with [Astro](https://astro.build) and hosted on GitHub Pages.
- Essays are files in this repository. The front page lists them newest first, whatever kind of essay they are. An essay can be marked as a reply to another, and the original then lists its responses.
- Authors write in a built-in editor at `/write/`. The editor is the essay page itself with a bar on top, so what you see while typing is what gets published. Margin notes, italics, headings, quotations and links are all there. Drafts autosave in the browser.
- Publishing commits the essay to this repository through the GitHub API, and GitHub Actions rebuilds the site. Each author needs a GitHub account and a one-time token.
- Authors appear under pen names. The pen name, not the GitHub account, is what readers see.
- Reader comments come from [giscus](https://giscus.app), stored in this repository's Discussions. They are off until configured.

The four essays and two authors shipped here are sample content to show the layout. Replace them.

## First-time setup

### 1. Keep the code on `main`

The deploy workflow and the editor both target the `main` branch (see `src/site.config.ts` and `.github/workflows/deploy.yml`). Make `main` the repository's default branch if it is not already: **Settings → General → Default branch**.

### 2. GitHub Pages

The site is served from the `gh-pages` branch. Every push to `main` runs `.github/workflows/deploy.yml`, which builds the site and rewrites `gh-pages` with the output, and GitHub publishes it to `https://aandelu.github.io/blog/` a minute or so later. Pages was switched on by the first deploy. If **Settings → Pages** ever shows it off, set **Build and deployment → Source** to *Deploy from a branch*, branch `gh-pages`, folder `/ (root)`.

### 3. Give each author a token

Each author does this once, on each device they write from:

1. Sign in to GitHub and open <https://github.com/settings/personal-access-tokens/new>.
2. Give the token a name. Under **Repository access** choose *Only select repositories* and pick this repository.
3. Under **Permissions → Repository permissions**, set **Contents** to *Read and write*. Leave everything else at *No access*.
4. Set an expiry (a year is the maximum), generate it, and copy it.
5. Open `https://aandelu.github.io/blog/write/`, click **Settings**, paste the token, click **Save token**.

The token is kept only in that browser. When it expires, make a new one the same way. Authors who are not collaborators on the repository need to be added first: **Settings → Collaborators**.

### 4. Turn on comments (optional)

1. In the repository: **Settings → General → Features**, tick **Discussions**.
2. Install the giscus app on the repository: <https://github.com/apps/giscus>.
3. Go to <https://giscus.app>, enter the repository, choose a Discussions category (create one called "Comments" if you like), and copy the four values it shows: `data-repo`, `data-repo-id`, `data-category`, `data-category-id`.
4. Paste them into `giscus` in `src/site.config.ts` and push.

Readers need a GitHub account to comment with giscus. If your readers mostly do not have one, [Cusdis](https://cusdis.com) is a drop-in alternative that only asks for a name. Swap the script in `src/components/Comments.astro`.

## Writing an essay

Go to `/write/`. Type a title, a one-line summary, the book (if there is one), and the essay. Select text to get the formatting bar. **Ctrl/⌘ + Shift + N** turns the selection into a margin note, or inserts an empty one at the cursor. In a title or summary, `*asterisks*` become italics, for book titles.

Pick who you are publishing as, set **Reply to** if the essay answers another, and press **Publish**. The site rebuilds within a couple of minutes. To change a published essay, open it on the site and click **Edit** (the link appears once a token is saved in that browser), or go to `/write/?slug=the-essay-slug`.

**Pictures.** Click **Add a picture** under the essay, or paste or drop an image into the text. It appears where the cursor was, with a caption you can type or leave empty. The browser shrinks it to at most 1600 pixels on its longest side before it goes anywhere. When you publish, the pictures are committed to `public/images/essays/<slug>/` and the essay refers to them there. To remove one, click it and press Delete.

Drafts live in the browser you wrote them in until published. The write page lists them.

You can also write essays by hand. Drop a file in `src/content/essays/` named `your-slug.md`:

```
---
title: "The title"
dek: "One line for the front page."
author: "folio"
date: "2026-09-04"
bookTitle: "The Book"
bookAuthor: "Its Author"
replyTo: "slug-of-the-essay-this-answers"
---
<p>The essay, as HTML or Markdown.</p>
<figure><img src="/images/essays/your-slug/picture.jpg" alt="What it shows"><figcaption>An optional caption.</figcaption></figure>
```

Only `title`, `author` and `date` are required. Add `draft: true` to keep an essay out of the build. Pictures go in `public/images/essays/your-slug/` and are written as `/images/…`; the build adds the site's base path.

## Adding an author

Create `src/content/authors/<id>.json`:

```json
{ "name": "Pen Name", "bio": "A sentence or two.", "color": "#5B7A5E" }
```

The `id` (the file name) is what goes in an essay's `author` field. The colour marks their essays on the front page. Push, and the new name appears in the editor's **Publish as** list.

## Changing the look

Colours, fonts and spacing are variables at the top of `src/styles/global.css`. Fonts load from Google Fonts in `src/layouts/Base.astro`. The site name and tagline are in `src/site.config.ts`.

## A custom domain later

1. Add the domain in **Settings → Pages → Custom domain** and set up the DNS records GitHub shows you.
2. In `astro.config.mjs`, set `site` to `https://your-domain.example` and `base` to `/`.
3. Push. Existing links inside the site adjust automatically.

## Running it locally

```
npm install
npm run dev
```

Then open <http://localhost:4321/blog/>. `npm run build` writes the finished site to `dist/`.

## Two things worth knowing

- **The repository is public.** The site does not show GitHub usernames anywhere, and the editor commits under the pen name. But anyone can open the repository on GitHub and see who has pushed to it. If the pen names are for real anonymity rather than style, publish through a GitHub account that is not linked to you.
- **Everything under `aandelu.github.io` shares one browser origin.** The saved token can be read by any other GitHub Pages site under the same account. That is fine while this is the only one. A custom domain removes the concern entirely.
