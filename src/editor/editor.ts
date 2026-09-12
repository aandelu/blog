// The in-browser essay editor. It renders inside the same page template and
// stylesheet as a published essay, keeps drafts in this browser, and
// publishes by committing a file to the repository through the GitHub API.
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Typography from '@tiptap/extension-typography';
import { Sidenote } from './sidenote';
import { Figure } from './figure';
import { extractDataImages, fetchImageFile, htmlHasText, imageFiles, pastedHtmlWithFigures, prepareImage, stripBase, withBase } from './images';
import { looksLikeHtml, parseFrontmatter, plainTextToHtml, serializeEssay, type EssayMeta } from './frontmatter';
import { GitHubError, fileSha, getFile, putFile, whoAmI } from './github';

interface AuthorInfo { id: string; name: string; color: string }
interface WriteConfig { repo: string; branch: string; essaysDir: string; base: string; authors: AuthorInfo[] }
interface EssayIndexItem { id: string; title: string; author: string; date: string }
interface Draft {
  id: string;
  slug: string;
  title: string;
  dek: string;
  bookTitle: string;
  bookAuthor: string;
  replyTo: string;
  author: string;
  date: string;
  html: string;
  sha?: string;
  updatedAt: number;
}

export const KEY_TOKEN = 'demagogues.token';
const KEY_AUTHOR = 'demagogues.author';
const DRAFT_PREFIX = 'demagogues.draft.';

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Editor page is missing #${id}`);
  return node as T;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function timeNow(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function storage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

function loadDraft(id: string): Draft | null {
  const raw = storage()?.getItem(DRAFT_PREFIX + id);
  if (!raw) return null;
  try { return JSON.parse(raw) as Draft; } catch { return null; }
}

// False when the browser refuses, which happens when pictures push a draft
// past the storage limit.
function saveDraft(draft: Draft): boolean {
  try {
    storage()?.setItem(DRAFT_PREFIX + draft.id, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

function deleteDraft(id: string): void {
  storage()?.removeItem(DRAFT_PREFIX + id);
}

function allDrafts(): Draft[] {
  const s = storage();
  if (!s) return [];
  const drafts: Draft[] = [];
  for (let i = 0; i < s.length; i++) {
    const key = s.key(i);
    if (key?.startsWith(DRAFT_PREFIX)) {
      const d = loadDraft(key.slice(DRAFT_PREFIX.length));
      if (d) drafts.push(d);
    }
  }
  return drafts.sort((a, b) => b.updatedAt - a.updatedAt);
}

// Replace the current selection inside a plain-text field with text.
function insertPlainText(plain: string): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const textNode = document.createTextNode(plain);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function newDraftId(): string {
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function mountEditor(): void {
  const config = JSON.parse(el('write-config').textContent || '{}') as WriteConfig;
  const params = new URLSearchParams(location.search);

  const ui = {
    title: el<HTMLElement>('title'),
    dek: el<HTMLElement>('dek'),
    bookTitle: el<HTMLElement>('book-title'),
    bookAuthor: el<HTMLElement>('book-author'),
    replyTo: el<HTMLSelectElement>('reply-to'),
    author: el<HTMLSelectElement>('author'),
    slug: el<HTMLInputElement>('slug'),
    date: el<HTMLInputElement>('date'),
    authorDot: el('author-dot'),
    authorName: el('author-name'),
    dateText: el('date-text'),
    status: el('status'),
    statusText: el('status-text'),
    publish: el<HTMLButtonElement>('btn-publish'),
    settingsBtn: el<HTMLButtonElement>('btn-settings'),
    settings: el<HTMLDialogElement>('settings'),
    settingsNote: el('settings-note'),
    token: el<HTMLInputElement>('token'),
    tokenSave: el<HTMLButtonElement>('token-save'),
    tokenForget: el<HTMLButtonElement>('token-forget'),
    tokenClose: el<HTMLButtonElement>('token-close'),
    fmt: el('fmt-bar'),
    picture: el<HTMLButtonElement>('btn-picture'),
    pictureFile: el<HTMLInputElement>('picture-file'),
    drafts: el('drafts'),
    toast: el('toast'),
    editorHost: el('editor'),
  };

  let draft: Draft = {
    id: params.get('draft') || newDraftId(),
    slug: '',
    title: '',
    dek: '',
    bookTitle: '',
    bookAuthor: '',
    replyTo: '',
    author: storage()?.getItem(KEY_AUTHOR) || config.authors[0]?.id || '',
    date: today(),
    html: '',
    updatedAt: Date.now(),
  };
  for (const a of config.authors) {
    const option = document.createElement('option');
    option.value = a.id;
    option.textContent = a.name;
    ui.author.appendChild(option);
  }

  let slugTouched = false;
  let saveTimer: number | undefined;
  let toastTimer: number | undefined;

  const token = () => storage()?.getItem(KEY_TOKEN) || '';

  // ----- status and toasts -----
  function status(text: string, kind: 'saved' | 'busy' | 'error' | '' = ''): void {
    ui.statusText.textContent = text;
    ui.status.className = `status ${kind}`.trim();
  }

  function toast(text: string, ms = 5000, html = false): void {
    if (html) ui.toast.innerHTML = text; else ui.toast.textContent = text;
    ui.toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { ui.toast.hidden = true; }, ms);
  }

  // Pictures arriving inside pasted rich text, waiting to be fetched and shrunk.
  const pendingPasted = new Set<string>();
  let unreadablePasted = 0;

  // ----- the body editor -----
  const editor = new Editor({
    element: ui.editorHost,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      }),
      Typography,
      Sidenote,
      Figure,
    ],
    content: '',
    editorProps: {
      attributes: { spellcheck: 'true' },
      // Runs before the paste is parsed: pictures in the HTML become figures.
      transformPastedHTML: (html) => {
        const result = pastedHtmlWithFigures(html);
        for (const src of result.srcs) pendingPasted.add(src);
        unreadablePasted = result.unreadable;
        return result.html;
      },
      handlePaste: (_view, event) => {
        // An image file on the clipboard with no text beside it (a screenshot,
        // a single copied picture) is inserted directly. Text with pictures in
        // it goes through the normal paste, figures included.
        const files = imageFiles(event.clipboardData);
        if (files.length === 0) return false;
        const html = event.clipboardData?.getData('text/html') ?? '';
        if (html && htmlHasText(html)) return false;
        pendingPasted.clear();
        unreadablePasted = 0;
        void insertPictures(files);
        return true;
      },
      handleDrop: (view, event) => {
        const files = imageFiles(event.dataTransfer);
        if (files.length === 0) return false;
        const drop = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (drop) editor.commands.setTextSelection(drop.pos);
        void insertPictures(files);
        return true;
      },
    },
    onUpdate: () => { markDirty(); updateEmptyClass(); },
    onTransaction: ({ transaction }) => {
      if (!transaction.getMeta('paste')) return;
      if (unreadablePasted) {
        const n = unreadablePasted;
        unreadablePasted = 0;
        toast(n === 1 ? 'One picture in the pasted text could not be read from the clipboard. Add it with "Add a picture".' : `${n} pictures in the pasted text could not be read from the clipboard. Add them with "Add a picture".`, 9000);
      }
      if (pendingPasted.size) void preparePastedPictures();
    },
    onSelectionUpdate: () => positionToolbar(),
    onFocus: () => positionToolbar(),
    onBlur: () => { window.setTimeout(() => { if (!editor.isFocused) ui.fmt.hidden = true; }, 150); },
  });

  function updateEmptyClass(): void {
    ui.editorHost.classList.toggle('is-empty', editor.isEmpty);
  }

  // ----- pictures -----
  async function insertPictures(files: File[]): Promise<void> {
    for (const file of files) {
      status('Preparing picture', 'busy');
      try {
        const { dataUrl, name } = await prepareImage(file);
        editor.chain().focus().insertFigure({ src: dataUrl, name }).run();
      } catch (error) {
        toast((error as Error).message || 'Could not add that picture.', 7000);
      }
    }
    markDirty();
  }
  // Pictures that came in with pasted text still point at their source. Fetch
  // each, shrink it, and swap it in. A website that refuses stays linked.
  async function preparePastedPictures(): Promise<void> {
    const srcs = Array.from(pendingPasted);
    pendingPasted.clear();
    const positionsOf = (src: string) => {
      const found: number[] = [];
      editor.state.doc.descendants((n, pos) => {
        if (n.type.name === 'figure' && n.attrs.src === src) found.push(pos);
        return n.type.name !== 'figure';
      });
      return found;
    };
    let linked = 0;
    for (const src of srcs) {
      if (positionsOf(src).length === 0) continue;
      status('Preparing picture', 'busy');
      let prepared: { dataUrl: string; name: string } | null = null;
      try { prepared = await prepareImage(await fetchImageFile(src)); } catch { prepared = null; }
      const positions = positionsOf(src);
      if (!prepared) {
        if (positions.length && /^(https?:)?\/\//i.test(src)) linked += 1;
        continue;
      }
      const tr = editor.state.tr;
      for (const pos of positions) tr.setNodeMarkup(pos, undefined, { ...editor.state.doc.nodeAt(pos)!.attrs, src: prepared.dataUrl, name: prepared.name });
      editor.view.dispatch(tr);
    }
    if (linked) toast(linked === 1 ? 'One pasted picture links to another website rather than being copied here. If it ever goes missing, add it with "Add a picture".' : `${linked} pasted pictures link to other websites rather than being copied here. If they ever go missing, add them with "Add a picture".`, 9000);
    markDirty();
  }
  ui.picture.addEventListener('click', () => { ui.pictureFile.value = ''; ui.pictureFile.click(); });
  ui.pictureFile.addEventListener('change', () => { void insertPictures(imageFiles(ui.pictureFile)); });
  // A file dropped anywhere else on the page would open in the browser and
  // leave the editor. Catch it and add the picture at the end instead.
  document.addEventListener('dragover', (event) => { if (imageFiles(event.dataTransfer).length) event.preventDefault(); });
  document.addEventListener('drop', (event) => {
    if (event.defaultPrevented) return; // the editor already took it
    const files = imageFiles(event.dataTransfer);
    if (files.length === 0) return;
    event.preventDefault();
    editor.commands.focus('end');
    void insertPictures(files);
  });

  // ----- floating format bar -----
  const commands: Record<string, () => void> = {
    bold: () => { editor.chain().focus().toggleBold().run(); },
    italic: () => { editor.chain().focus().toggleItalic().run(); },
    heading: () => { editor.chain().focus().toggleHeading({ level: 2 }).run(); },
    quote: () => { editor.chain().focus().toggleBlockquote().run(); },
    link: () => {
      const previous = (editor.getAttributes('link').href as string | undefined) ?? '';
      const href = window.prompt('Link to', previous || 'https://');
      if (href === null) { editor.commands.focus(); return; }
      const clean = href.trim();
      if (!clean || clean === 'https://') editor.chain().focus().extendMarkRange('link').unsetLink().run();
      else editor.chain().focus().extendMarkRange('link').setLink({ href: clean }).run();
    },
    note: () => { editor.chain().focus().insertSidenote().run(); },
  };

  const active: Record<string, () => boolean> = {
    bold: () => editor.isActive('bold'),
    italic: () => editor.isActive('italic'),
    heading: () => editor.isActive('heading', { level: 2 }),
    quote: () => editor.isActive('blockquote'),
    link: () => editor.isActive('link'),
    note: () => editor.isActive('sidenote'),
  };

  for (const button of ui.fmt.querySelectorAll<HTMLButtonElement>('button[data-cmd]')) {
    // mousedown, not click, so the editor keeps its selection and focus.
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      commands[button.dataset.cmd!]?.();
      positionToolbar();
    });
  }

  function positionToolbar(): void {
    const { from, to, empty } = editor.state.selection;
    if (empty || !editor.isFocused) { ui.fmt.hidden = true; return; }
    const start = editor.view.coordsAtPos(from);
    const end = editor.view.coordsAtPos(to);
    ui.fmt.hidden = false;
    const rect = ui.fmt.getBoundingClientRect();
    const left = Math.max(8, Math.min(start.left, end.left, window.innerWidth - rect.width - 8)) + window.scrollX;
    const top = Math.max(60, start.top - rect.height - 10) + window.scrollY;
    ui.fmt.style.left = `${left}px`;
    ui.fmt.style.top = `${top}px`;
    for (const button of ui.fmt.querySelectorAll<HTMLButtonElement>('button[data-cmd]')) {
      button.classList.toggle('on', active[button.dataset.cmd!]?.() ?? false);
    }
  }

  // ----- fields <-> draft -----
  const text = (node: HTMLElement) => (node.textContent ?? '').replace(/\s+/g, ' ').trim();

  function readFields(): void {
    draft.title = text(ui.title);
    draft.dek = text(ui.dek);
    draft.bookTitle = text(ui.bookTitle);
    draft.bookAuthor = text(ui.bookAuthor);
    draft.replyTo = ui.replyTo.value;
    draft.author = ui.author.value;
    draft.date = ui.date.value || today();
    if (!slugTouched) {
      draft.slug = slugify(draft.title);
      ui.slug.value = draft.slug;
    } else {
      draft.slug = slugify(ui.slug.value);
    }
    draft.html = editor.isEmpty ? '' : editor.getHTML();
  }

  function writeFields(): void {
    ui.title.textContent = draft.title;
    ui.dek.textContent = draft.dek;
    ui.bookTitle.textContent = draft.bookTitle;
    ui.bookAuthor.textContent = draft.bookAuthor;
    ui.author.value = draft.author;
    if (ui.author.value !== draft.author && config.authors[0]) { draft.author = config.authors[0].id; ui.author.value = draft.author; }
    ui.date.value = draft.date;
    ui.slug.value = draft.slug;
    setReplyTo(draft.replyTo);
    editor.commands.setContent(draft.html || '', { emitUpdate: false });
    updateEmptyClass();
    syncByline();
  }

  function syncByline(): void {
    const author = config.authors.find((a) => a.id === ui.author.value);
    ui.authorName.textContent = author?.name ?? 'Choose a pen name';
    ui.authorDot.parentElement?.style.setProperty('--author', author?.color ?? 'var(--muted)');
    ui.dateText.textContent = formatDate(ui.date.value || today());
  }

  function setReplyTo(id: string): void {
    if (id && !Array.from(ui.replyTo.options).some((o) => o.value === id)) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = id;
      ui.replyTo.appendChild(option);
    }
    ui.replyTo.value = id;
  }

  // ----- autosave -----
  function markDirty(): void {
    status('Draft, unsaved');
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveNow, 600);
  }

  function saveNow(): void {
    window.clearTimeout(saveTimer);
    readFields();
    draft.updatedAt = Date.now();
    if (saveDraft(draft)) status(`Draft, saved ${timeNow()}`, 'saved');
    else status('Draft too big to save here. Publish to keep it.', 'error');
  }

  ui.title.addEventListener('input', () => {
    if (!slugTouched) ui.slug.value = slugify(text(ui.title));
  });
  for (const node of [ui.title, ui.dek, ui.bookTitle, ui.bookAuthor]) {
    node.addEventListener('input', markDirty);
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        const order = [ui.title, ui.dek, ui.bookTitle, ui.bookAuthor];
        const next = order[order.indexOf(node) + 1];
        if (next) next.focus(); else editor.commands.focus('start');
      }
    });
    node.addEventListener('paste', (event) => {
      event.preventDefault();
      const plain = event.clipboardData?.getData('text/plain').replace(/\s+/g, ' ') ?? '';
      insertPlainText(plain);
      node.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  ui.slug.addEventListener('input', () => { slugTouched = true; markDirty(); });
  ui.replyTo.addEventListener('change', markDirty);
  ui.author.addEventListener('change', () => { storage()?.setItem(KEY_AUTHOR, ui.author.value); syncByline(); markDirty(); });
  ui.date.addEventListener('change', () => { syncByline(); markDirty(); });
  window.addEventListener('beforeunload', () => { if (saveTimer) saveNow(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && saveTimer) saveNow(); });

  // ----- drafts kept in this browser -----
  function renderDrafts(): void {
    const others = allDrafts().filter((d) => d.id !== draft.id);
    ui.drafts.hidden = others.length === 0;
    ui.drafts.innerHTML = '';
    if (others.length === 0) return;
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = 'Drafts on this device';
    ui.drafts.appendChild(label);
    for (const d of others) {
      const row = document.createElement('div');
      const link = document.createElement('a');
      link.href = `?draft=${encodeURIComponent(d.id)}`;
      link.textContent = d.title || 'Untitled';
      const when = document.createElement('span');
      when.textContent = ` · ${new Date(d.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}${d.sha ? ' · published' : ''} · `;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'forget';
      remove.addEventListener('click', () => {
        if (window.confirm(`Forget the local draft "${d.title || 'Untitled'}"? Published essays stay on the site.`)) {
          deleteDraft(d.id);
          renderDrafts();
        }
      });
      row.append(link, when, remove);
      ui.drafts.appendChild(row);
    }
  }

  // ----- settings (token) -----
  function openSettings(note = ''): void {
    ui.settingsNote.textContent = note;
    ui.settingsNote.hidden = !note;
    ui.token.value = token();
    ui.settings.showModal();
  }
  ui.settingsBtn.addEventListener('click', () => openSettings());
  ui.tokenClose.addEventListener('click', () => ui.settings.close());
  ui.tokenForget.addEventListener('click', () => {
    storage()?.removeItem(KEY_TOKEN);
    ui.token.value = '';
    toast('Token removed from this browser.');
  });
  ui.tokenSave.addEventListener('click', async () => {
    const value = ui.token.value.trim();
    if (!value) { toast('Paste a token first.'); return; }
    ui.tokenSave.disabled = true;
    try {
      const login = await whoAmI(value);
      storage()?.setItem(KEY_TOKEN, value);
      ui.settings.close();
      toast(`Token saved. GitHub knows you as ${login}.`);
    } catch (error) {
      ui.settingsNote.hidden = false;
      ui.settingsNote.textContent = `GitHub rejected that token: ${(error as Error).message}`;
    } finally {
      ui.tokenSave.disabled = false;
    }
  });

  // ----- publish -----
  async function publish(): Promise<void> {
    saveNow();
    if (!draft.title) { toast('Give the essay a title first.'); ui.title.focus(); return; }
    if (!draft.slug) { toast('The address slug is empty. Type one in the Slug field.'); ui.slug.focus(); return; }
    if (!draft.html) { toast('The essay has no text yet.'); editor.commands.focus(); return; }
    const author = config.authors.find((a) => a.id === draft.author);
    if (!author) { toast('Pick a pen name to publish as.'); return; }
    const tok = token();
    if (!tok) { openSettings('Add a GitHub token to publish. Drafts stay in this browser until then.'); return; }

    const path = `${config.essaysDir}/${draft.slug}.md`;
    const pictures = await extractDataImages(stripBase(draft.html, config.base), draft.slug);
    const meta: EssayMeta = {
      title: draft.title,
      dek: draft.dek || undefined,
      author: draft.author,
      date: draft.date,
      bookTitle: draft.bookTitle || undefined,
      bookAuthor: draft.bookAuthor || undefined,
      replyTo: draft.replyTo || undefined,
    };
    const content = serializeEssay(meta, pictures.html);
    const commitAuthor = { name: author.name, email: `${author.id}@essays.invalid` };

    ui.publish.disabled = true;
    status('Publishing', 'busy');
    try {
      // Pictures go up first, one commit each, skipping any already there.
      for (const [i, upload] of pictures.uploads.entries()) {
        status(`Uploading picture ${i + 1} of ${pictures.uploads.length}`, 'busy');
        if (await fileSha(config.repo, upload.path, config.branch, tok)) continue;
        await putFile({ repo: config.repo, path: upload.path, branch: config.branch, content: upload.base64, contentIsBase64: true, message: `Add a picture to "${draft.title}"`, token: tok, author: commitAuthor });
      }
      status('Publishing', 'busy');
      let sha = draft.sha;
      if (!sha) {
        const existing = await getFile(config.repo, path, config.branch, tok);
        if (existing) {
          if (!window.confirm(`An essay already lives at ${draft.slug}. Replace it with this one?`)) { status('Draft', 'saved'); return; }
          sha = existing.sha;
        }
      }
      const message = `${sha ? 'Update' : 'Publish'} "${draft.title}"`;
      let result;
      try {
        result = await putFile({ repo: config.repo, path, branch: config.branch, content, message, sha, token: tok, author: commitAuthor });
      } catch (error) {
        // A stale file hash means the file changed since we loaded it. Refresh and retry once.
        if (error instanceof GitHubError && (error.status === 409 || error.status === 422)) {
          const fresh = await getFile(config.repo, path, config.branch, tok);
          result = await putFile({ repo: config.repo, path, branch: config.branch, content, message, sha: fresh?.sha, token: tok, author: commitAuthor });
        } else {
          throw error;
        }
      }
      draft.sha = result.sha;
      draft.updatedAt = Date.now();
      saveDraft(draft);
      status(`Published ${timeNow()}`, 'saved');
      const href = `${config.base}essays/${encodeURIComponent(draft.slug)}/`;
      toast(`Published. The site rebuilds in a minute or two. <a href="${href}">Open the essay</a>`, 12000, true);
      renderDrafts();
    } catch (error) {
      const err = error as GitHubError;
      if (err.status === 401) openSettings('GitHub rejected the token. It may have expired.');
      else if (err.status === 403 || err.status === 404) openSettings(`GitHub refused the write (${err.message}). Check the token has "Contents: read and write" on ${config.repo}.`);
      else toast(`Publish failed: ${err.message || 'unknown error'}`, 8000);
      status('Draft, not published', 'error');
    } finally {
      ui.publish.disabled = false;
    }
  }
  ui.publish.addEventListener('click', () => { void publish(); });

  // ----- reply-to picker -----
  async function loadIndex(): Promise<void> {
    try {
      const res = await fetch(`${config.base}essays.json`, { cache: 'no-store' });
      if (!res.ok) return;
      const items = (await res.json()) as EssayIndexItem[];
      const current = ui.replyTo.value;
      ui.replyTo.innerHTML = '<option value="">nothing</option>';
      for (const item of items) {
        if (item.id === draft.slug) continue;
        const option = document.createElement('option');
        option.value = item.id;
        const author = config.authors.find((a) => a.id === item.author)?.name ?? item.author;
        option.textContent = `${author}: ${item.title}`;
        ui.replyTo.appendChild(option);
      }
      setReplyTo(current);
    } catch {
      // The picker still works for whatever was already set.
    }
  }

  // ----- load -----
  async function init(): Promise<void> {
    const slug = params.get('slug');
    if (slug) {
      const local = allDrafts().find((d) => d.slug === slug);
      // Keep the requested address even if GitHub cannot be reached.
      draft.slug = slug;
      slugTouched = true;
      status('Loading from GitHub', 'busy');
      try {
        const file = await getFile(config.repo, `${config.essaysDir}/${slug}.md`, config.branch, token() || undefined);
        if (file) {
          const { meta, body } = parseFrontmatter(file.content);
          const str = (v: unknown) => (typeof v === 'string' ? v : '');
          draft = {
            ...draft,
            id: local?.id ?? draft.id,
            slug,
            title: str(meta.title),
            dek: str(meta.dek),
            bookTitle: str(meta.bookTitle),
            bookAuthor: str(meta.bookAuthor),
            replyTo: str(meta.replyTo),
            author: str(meta.author) || draft.author,
            date: str(meta.date).slice(0, 10) || today(),
            html: looksLikeHtml(body) ? withBase(body, config.base) : plainTextToHtml(body),
            sha: file.sha,
          };
          if (!looksLikeHtml(body)) toast('This essay was written in Markdown by hand. Its text is here, but the formatting will need redoing.', 9000);
          if (local && local.html && local.html !== draft.html && local.updatedAt > Date.now() - 14 * 86400000) {
            if (window.confirm('This browser has a newer unpublished draft of this essay. Load that instead of the published version?')) {
              draft = { ...local, sha: file.sha };
            }
          }
        } else {
          toast(`No essay called "${slug}" is published. Starting a new one with that address.`, 7000);
        }
      } catch (error) {
        toast(`Could not load the essay from GitHub: ${(error as Error).message}`, 8000);
      }
      history.replaceState(null, '', `?draft=${encodeURIComponent(draft.id)}`);
    } else if (params.get('draft')) {
      const saved = loadDraft(draft.id);
      if (saved) {
        draft = saved;
        slugTouched = Boolean(saved.slug) && saved.slug !== slugify(saved.title);
      }
    } else {
      history.replaceState(null, '', `?draft=${encodeURIComponent(draft.id)}`);
    }

    writeFields();
    saveDraft({ ...draft, updatedAt: draft.updatedAt || Date.now() });
    status(draft.sha ? 'Editing a published essay' : 'Draft', 'saved');
    renderDrafts();
    await loadIndex();
    if (!token()) {
      const hint = document.getElementById('token-hint');
      if (hint) hint.hidden = false;
    }
  }

  void init();
}
