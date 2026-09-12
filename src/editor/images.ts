// Pictures. They are shrunk in the browser before they go anywhere, carried
// in the draft as data URLs, and swapped for repository paths on publishing.

export const MAX_EDGE = 1600; // longest side after resizing, in pixels
const KEEP_AS_IS = 500_000; // files this small are stored untouched
const PNG_LIMIT = 900_000; // a resized PNG bigger than this becomes a JPEG
const VECTOR_LIMIT = 2_000_000;

const EXT: Record<string, string> = { jpeg: 'jpg', jpg: 'jpg', png: 'png', gif: 'gif', webp: 'webp', 'svg+xml': 'svg', avif: 'avif' };

export interface PreparedImage { dataUrl: string; name: string }
export interface PendingUpload { path: string; src: string; base64: string }

function baseName(filename: string): string {
  const stem = filename.replace(/\.[a-z0-9]+$/i, '');
  const slug = stem.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return slug || 'picture';
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsDataURL(blob);
  });
}

function dataUrlBytes(dataUrl: string): number {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.floor((b64.length * 3) / 4);
}

interface Decoded {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  cleanup: () => void;
}

async function decode(file: File): Promise<Decoded> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { width: bitmap.width, height: bitmap.height, draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h), cleanup: () => bitmap.close() };
  } catch {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`"${file.name}" is not a picture this browser can read.`)); };
      image.src = url;
    });
    return { width: img.naturalWidth, height: img.naturalHeight, draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h), cleanup: () => URL.revokeObjectURL(url) };
  }
}

// Shrinks a picture to at most MAX_EDGE pixels on its longest side and
// returns it as a data URL, along with a tidy file name.
export async function prepareImage(file: File): Promise<PreparedImage> {
  const subtype = file.type.replace(/^image\//, '');
  const base = baseName(file.name);
  if (subtype === 'svg+xml' || subtype === 'gif') {
    if (file.size > VECTOR_LIMIT) throw new Error(`"${file.name}" is too big. Keep SVG and GIF files under 2 MB.`);
    return { dataUrl: await readAsDataUrl(file), name: `${base}.${EXT[subtype]}` };
  }
  const decoded = await decode(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(decoded.width, decoded.height, 1));
    if (scale === 1 && file.size <= KEEP_AS_IS && EXT[subtype] && subtype !== 'avif') {
      return { dataUrl: await readAsDataUrl(file), name: `${base}.${EXT[subtype]}` };
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(decoded.width * scale));
    canvas.height = Math.max(1, Math.round(decoded.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser could not draw the picture.');
    decoded.draw(ctx, canvas.width, canvas.height);
    if (subtype === 'png') {
      const png = canvas.toDataURL('image/png');
      if (dataUrlBytes(png) <= PNG_LIMIT) return { dataUrl: png, name: `${base}.png` };
    }
    // JPEG has no transparency, so lay the picture on white first.
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    decoded.draw(ctx, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), name: `${base}.jpg` };
  } finally {
    decoded.cleanup();
  }
}

// Works for a file input, a paste or a drop.
export function imageFiles(source: { files?: FileList | null } | null | undefined): File[] {
  return Array.from(source?.files ?? []).filter((f) => f.type.startsWith('image/'));
}

async function sha1Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Finds pictures still carried as data URLs, gives each a repository path
// under public/images/essays/<slug>/, and rewrites the HTML to point there.
// The path includes a hash of the bytes, so the same picture always gets the
// same name and is never uploaded twice.
export async function extractDataImages(html: string, slug: string): Promise<{ html: string; uploads: PendingUpload[] }> {
  const uploads: PendingUpload[] = [];
  let out = html;
  for (const match of html.matchAll(/<img\b[^>]*\bsrc="data:image\/([a-z0-9.+-]+);base64,([^"]+)"[^>]*>/gi)) {
    const [tag, subtype, base64] = match as unknown as [string, string, string];
    const ext = EXT[subtype.toLowerCase()] ?? 'bin';
    const name = baseName(/\bdata-name="([^"]*)"/.exec(tag)?.[1] ?? '');
    const alt = /\balt="([^"]*)"/.exec(tag)?.[1] ?? '';
    const hash = (await sha1Hex(base64)).slice(0, 8);
    const src = `/images/essays/${slug}/${name}-${hash}.${ext}`;
    if (!uploads.some((u) => u.src === src)) uploads.push({ path: `public${src}`, src, base64 });
    out = out.replace(tag, () => `<img src="${src}" alt="${alt}">`);
  }
  return { html: out, uploads };
}

// Essay files use site-relative picture paths ("/images/…"). The editor
// shows the pictures from wherever the site is actually served, so it adds
// the base path on load and removes it again on publish.
export function withBase(html: string, base: string): string {
  const prefix = base.replace(/\/$/, '');
  if (!prefix) return html;
  return html.replace(/(<img\b[^>]*\bsrc=")([^"]*)"/gi, (_m, pre: string, src: string) =>
    `${pre}${src.startsWith('/') && !src.startsWith('//') && !src.startsWith(`${prefix}/`) ? prefix + src : src}"`);
}

export function stripBase(html: string, base: string): string {
  const prefix = base.replace(/\/$/, '');
  if (!prefix) return html;
  return html.replace(/(<img\b[^>]*\bsrc=")([^"]*)"/gi, (_m, pre: string, src: string) =>
    `${pre}${src.startsWith(`${prefix}/`) ? src.slice(prefix.length) : src}"`);
}

// Pasted rich text (from a web page, a document, a note) can carry pictures
// as <img> tags. Each becomes a figure the editor understands. Pictures the
// browser can never read, such as file:// paths from Word, are dropped and
// counted so the writer can be told.
export function pastedHtmlWithFigures(html: string): { html: string; srcs: string[]; unreadable: number } {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const srcs: string[] = [];
  let unreadable = 0;
  for (const img of Array.from(doc.querySelectorAll('img'))) {
    const src = (img.getAttribute('src') ?? '').trim();
    const host: Element = img.closest('figure') ?? img;
    if (!/^(data:image\/|https?:\/\/|\/\/)/i.test(src)) {
      unreadable += 1;
      host.remove();
      continue;
    }
    const figure = doc.createElement('figure');
    const copy = doc.createElement('img');
    copy.setAttribute('src', src);
    copy.setAttribute('alt', img.getAttribute('alt') ?? '');
    const caption = doc.createElement('figcaption');
    caption.textContent = host === img ? '' : (host.querySelector('figcaption')?.textContent?.trim() ?? '');
    figure.append(copy, caption);
    host.replaceWith(figure);
    if (!srcs.includes(src)) srcs.push(src);
  }
  return { html: doc.body.innerHTML, srcs, unreadable };
}

export function htmlHasText(html: string): boolean {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent ?? '').trim().length > 0;
}

// Fetches a pasted picture's bytes so it can be shrunk and stored like any
// other. Works for data URLs, and for websites that allow it.
export async function fetchImageFile(src: string): Promise<File> {
  const res = await fetch(src, { mode: 'cors' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  if (!blob.type.startsWith('image/')) throw new Error('Not an image');
  let name = 'pasted-picture';
  if (/^(https?:)?\/\//i.test(src)) {
    try {
      const last = new URL(src, location.href).pathname.split('/').filter(Boolean).pop();
      if (last) name = decodeURIComponent(last);
    } catch { /* keep the default name */ }
  }
  return new File([blob], name, { type: blob.type });
}
