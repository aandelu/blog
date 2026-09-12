# Design directions

Three looks were mocked up before the site was built. **A, Quiet editorial, is the one the site uses.** B and C are kept here in case the mood changes.

| Direction | Feel | Tradeoff |
| --- | --- | --- |
| **A · Quiet editorial** (chosen) | Warm paper, one serif, thin rules, a small colour per author. The page stays out of the writing's way. | The quietest of the three. Its personality has to come from the essays. |
| **B · Broadsheet** | A journal masthead, display headlines, two columns, so a reply can sit beside what it answers. The dueling is visible from the front page. | Louder, more chrome, further from the plainness of the essay sites you liked. |
| **C · Austere** | Monospace chrome, ISO dates, dotted rules, black on white. The plainness of a developer's blog, made deliberate. | Reads as a tech blog before it reads as a book blog. |

## What is in `mockups/`

- `A-quiet-editorial-feed.png`, `B-broadsheet-feed.png`, `C-austere-feed.png`: the front page in each direction. These are the reference.
- `A-essay-page.png`, `A-editor.png`: the essay page and the editor, in A. Whichever direction is used, these two follow it.
- `*.dc.html` and `canvas.json`: the source artboards for the design canvas. They can be re-opened as a canvas, or read as plain HTML and CSS for the exact fonts, colours and spacing of each direction.

The same canvas is published at <https://claude.ai/code/artifact/1cdf8bb5-494d-4fbf-9db6-4382f049247d>.

## Switching direction later

Every colour, font and rule lives in `src/styles/global.css`, mostly as variables at the top of the file. B and C are a stylesheet change, not a rebuild: keep the pages and components, swap the tokens and the handful of rules that give each direction its shape (masthead, headline size, column count, rule style).
