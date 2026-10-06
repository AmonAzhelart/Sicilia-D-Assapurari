// Helper condivisi dalle funzioni API (il prefisso "_" esclude il file dalle route Vercel).
import crypto from 'node:crypto';

export const COOKIE = '__admin_sid';
export const SAFE_FILE = /^[\w\- .]+\.json$/;

const PROJECT = encodeURIComponent(process.env.GITLAB_PROJECT || 'fonti.alessandro98/catalogo_sicilia_dassapurari');
const BRANCH = process.env.GITLAB_BRANCH || 'main';
const FILES_API = `https://gitlab.com/api/v4/projects/${PROJECT}/repository/files/`;
const IMAGE_DATA_URL = /^data:image\/(webp|png|jpe?g|gif|avif);base64,/;

const gitlabHeaders = (extra = {}) =>
  process.env.GITLAB_TOKEN ? { ...extra, 'PRIVATE-TOKEN': process.env.GITLAB_TOKEN } : extra;

export async function readRepoFile(file) {
  const res = await fetch(`${FILES_API}${encodeURIComponent(file)}/raw?ref=${encodeURIComponent(BRANCH)}`, {
    headers: gitlabHeaders(),
  });
  if (!res.ok) throw Object.assign(new Error(`GitLab ${res.status} leggendo ${file}`), { status: res.status });
  return res.text();
}

export async function writeRepoFile(file, content, message) {
  const url = FILES_API + encodeURIComponent(file);
  const init = (method) => ({
    method,
    headers: gitlabHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ branch: BRANCH, content, commit_message: message }),
  });
  const res = await fetch(url, init('PUT'));
  if (res.ok) return;
  const putError = `GitLab ${res.status}: ${await res.text()}`;
  // GitLab risponde 400/404 al PUT quando il file non esiste ancora: lo creiamo.
  if (res.status === 400 || res.status === 404) {
    const created = await fetch(url, init('POST'));
    if (created.ok) return;
  }
  throw new Error(putError);
}

export async function deleteRepoFile(file, message) {
  const res = await fetch(FILES_API + encodeURIComponent(file), {
    method: 'DELETE',
    headers: gitlabHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ branch: BRANCH, commit_message: message }),
  });
  if (!res.ok && res.status !== 404) throw new Error(`GitLab ${res.status}: ${await res.text()}`);
}

export const isImageDataUrl = (value) => typeof value === 'string' && IMAGE_DATA_URL.test(value);
export const imageHash = (dataUrl) => crypto.createHash('sha1').update(dataUrl).digest('hex').slice(0, 16);

export const sign = (value, secret) => crypto.createHmac('sha256', secret).update(String(value)).digest('hex');

export function safeEqual(a, b) {
  const digest = (v) => crypto.createHash('sha256').update(String(v)).digest();
  return crypto.timingSafeEqual(digest(a), digest(b));
}

export function parseCookies(header) {
  const out = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export function isAdmin(req) {
  const secret = process.env.COOKIE_SECRET;
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!secret || !token) return false;
  const [expiry, sig] = token.split('.');
  if (!sig || !(Number(expiry) > Date.now())) return false;
  return safeEqual(sig, sign(expiry, secret));
}

export function readBody(req, limit = 6 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('Payload troppo grande'), { status: 413 }));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function send(res, status, body, cacheControl = 'no-store') {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cacheControl);
  res.end(JSON.stringify(body));
}

export function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.end();
}
