// Minimal GitHub Contents API client. Publishing an essay is one commit.

const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'GitHubError';
  }
}

function headers(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string };
    return body.message ? `${body.message} (HTTP ${res.status})` : `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function decodeBase64(b64: string): string {
  const binary = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export async function getFile(repo: string, path: string, branch: string, token?: string): Promise<{ sha: string; content: string } | null> {
  const res = await fetch(`${API}/repos/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`, { headers: headers(token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new GitHubError(res.status, await errorMessage(res));
  const json = (await res.json()) as { sha: string; content: string };
  return { sha: json.sha, content: decodeBase64(json.content) };
}

export interface PutFileOptions {
  repo: string;
  path: string;
  branch: string;
  content: string;
  message: string;
  token: string;
  sha?: string;
  author: { name: string; email: string };
}

export async function putFile(opts: PutFileOptions): Promise<{ sha: string; commitUrl: string }> {
  const res = await fetch(`${API}/repos/${opts.repo}/contents/${encodePath(opts.path)}`, {
    method: 'PUT',
    headers: { ...headers(opts.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: opts.message,
      content: encodeBase64(opts.content),
      branch: opts.branch,
      sha: opts.sha,
      author: opts.author,
      committer: opts.author,
    }),
  });
  if (!res.ok) throw new GitHubError(res.status, await errorMessage(res));
  const json = (await res.json()) as { content: { sha: string }; commit: { html_url: string } };
  return { sha: json.content.sha, commitUrl: json.commit.html_url };
}

export async function whoAmI(token: string): Promise<string> {
  const res = await fetch(`${API}/user`, { headers: headers(token) });
  if (!res.ok) throw new GitHubError(res.status, await errorMessage(res));
  const json = (await res.json()) as { login: string };
  return json.login;
}
